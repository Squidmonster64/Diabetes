import { Decimal } from "./decimal.js";
import type { BolusSuccess } from "./types.js";
import { sha256, type AuditStore, type CalculationRecord, type CalculationRepository } from "./repositories.js";

export interface ConfirmationRequest {
  readonly calculationId: string;
  readonly patientId: string;
  readonly confirmed: true;
  readonly confirmationTextAccepted: true;
  readonly confirmedAt: string;
  readonly expectedSnapshotHash: string;
}

export interface AdministrationRequest {
  readonly calculationId: string;
  readonly patientId: string;
  readonly administeredUnits: string;
  readonly administeredAt: string;
}

export interface RejectionRequest {
  readonly calculationId: string;
  readonly patientId: string;
  readonly rejectedAt: string;
  readonly reason: "USER_REJECTED" | "INPUT_CHANGED" | "SETTINGS_CHANGED";
}

export type WorkflowFailureCode =
  | "NOT_FOUND"
  | "PATIENT_MISMATCH"
  | "NOT_CONFIRMABLE"
  | "CALCULATION_EXPIRED"
  | "CALCULATION_INVALIDATED"
  | "SNAPSHOT_MISMATCH"
  | "DUPLICATE_CONFIRMATION"
  | "AUDIT_PERSISTENCE_FAILURE"
  | "INVALID_ADMINISTRATION";

export interface WorkflowSuccess {
  readonly ok: true;
  readonly record: CalculationRecord;
}

export interface WorkflowFailure {
  readonly ok: false;
  readonly code: WorkflowFailureCode;
}

export type WorkflowResponse = WorkflowSuccess | WorkflowFailure;

export interface ConfirmationDependencies {
  readonly calculationRepository: CalculationRepository;
  readonly auditStore: AuditStore;
}

function isConfirmable(state: CalculationRecord["state"]): boolean {
  return state === "CALCULATED" || state === "CALCULATED_ZERO";
}

/**
 * confirmBolus - handoff section 8.6 / 9.4-9.6. Confirmation gates 36-41.
 * Idempotent: a second confirmation request returns DUPLICATE_CONFIRMATION
 * rather than creating a second confirmed record.
 */
export async function confirmBolus(
  request: ConfirmationRequest,
  deps: ConfirmationDependencies,
): Promise<WorkflowResponse> {
  const record = await deps.calculationRepository.get(request.calculationId);
  // Gate 36: patient mismatch
  if (!record) return { ok: false, code: "NOT_FOUND" };
  if (record.patientId !== request.patientId) return { ok: false, code: "PATIENT_MISMATCH" };

  // Gate 40: duplicate confirmation
  if (record.state === "USER_CONFIRMED" || record.state === "ADMINISTRATION_RECORDED") {
    return { ok: false, code: "DUPLICATE_CONFIRMATION" };
  }
  if (record.state === "INVALIDATED") return { ok: false, code: "CALCULATION_INVALIDATED" };

  // Gate 37: not confirmable
  if (!isConfirmable(record.state)) return { ok: false, code: "NOT_CONFIRMABLE" };

  // Gate 41: explicit text not accepted
  if (request.confirmed !== true || request.confirmationTextAccepted !== true) {
    return { ok: false, code: "NOT_CONFIRMABLE" };
  }

  // Gate 38: expired preview. Conflict C-07 boundary: confirmedAt === expiresAt is accepted;
  // any instant later than expiresAt is refused.
  if (!record.expiresAt || Date.parse(request.confirmedAt) > Date.parse(record.expiresAt)) {
    const expired = await deps.calculationRepository.update(record.calculationId, { state: "EXPIRED" });
    await tryAppend(deps.auditStore, {
      eventType: "CALCULATION_EXPIRED",
      patientId: record.patientId,
      calculationId: record.calculationId,
      occurredAt: request.confirmedAt,
      payload: {},
      offline: false,
    });
    void expired;
    return { ok: false, code: "CALCULATION_EXPIRED" };
  }

  // Gate 39: changed snapshot
  if (request.expectedSnapshotHash !== record.snapshotHash) {
    return { ok: false, code: "SNAPSHOT_MISMATCH" };
  }

  const confirmationHash = sha256({
    calculationId: record.calculationId,
    snapshotHash: request.expectedSnapshotHash,
    confirmedAt: request.confirmedAt,
  });

  try {
    await appendOrThrow(deps.auditStore, {
      eventType: "CALCULATION_CONFIRMED",
      patientId: record.patientId,
      calculationId: record.calculationId,
      occurredAt: request.confirmedAt,
      payload: { confirmationHash },
      offline: false,
    });
  } catch {
    return { ok: false, code: "AUDIT_PERSISTENCE_FAILURE" };
  }

  const confirmed = await deps.calculationRepository.update(record.calculationId, {
    state: "USER_CONFIRMED",
    confirmedAt: request.confirmedAt,
    confirmationHash,
  });

  return { ok: true, record: confirmed };
}

/** rejectBolusPreview - handoff section 8.8. */
export async function rejectBolusPreview(
  request: RejectionRequest,
  deps: ConfirmationDependencies,
): Promise<WorkflowResponse> {
  const record = await deps.calculationRepository.get(request.calculationId);
  if (!record) return { ok: false, code: "NOT_FOUND" };
  if (record.patientId !== request.patientId) return { ok: false, code: "PATIENT_MISMATCH" };
  if (!isConfirmable(record.state)) return { ok: false, code: "NOT_CONFIRMABLE" };

  await tryAppend(deps.auditStore, {
    eventType: "CALCULATION_INVALIDATED",
    patientId: request.patientId,
    calculationId: request.calculationId,
    occurredAt: request.rejectedAt,
    payload: { reason: request.reason },
    offline: false,
  });

  const invalidated = await deps.calculationRepository.update(record.calculationId, {
    state: "INVALIDATED",
    invalidatedAt: request.rejectedAt,
    invalidationReason: request.reason,
  });
  return { ok: true, record: invalidated };
}

/**
 * logConfirmedBolus - handoff section 8.7 / 9.2. Records the actual
 * administered dose after a separate, explicit user action. Never assumes the
 * calculated dose was used; never overwrites the calculation.
 */
export async function logConfirmedBolus(
  request: AdministrationRequest,
  deps: ConfirmationDependencies,
): Promise<WorkflowResponse> {
  const record = await deps.calculationRepository.get(request.calculationId);
  if (!record) return { ok: false, code: "NOT_FOUND" };
  if (record.patientId !== request.patientId) return { ok: false, code: "PATIENT_MISMATCH" };
  if (record.state !== "USER_CONFIRMED") return { ok: false, code: "NOT_CONFIRMABLE" };

  try {
    const units = Decimal.parse(request.administeredUnits);
    if (units.compare(Decimal.fromInteger(0n)) <= 0 || !Number.isFinite(Date.parse(request.administeredAt))) {
      return { ok: false, code: "INVALID_ADMINISTRATION" };
    }
  } catch {
    return { ok: false, code: "INVALID_ADMINISTRATION" };
  }

  const calculatedUnits = record.result.status === "REFUSED" ? null : (record.result as BolusSuccess).roundedTotalUnits;

  await tryAppend(deps.auditStore, {
    eventType: "ADMINISTRATION_RECORDED",
    patientId: record.patientId,
    calculationId: record.calculationId,
    occurredAt: request.administeredAt,
    payload: { administeredUnits: request.administeredUnits, calculatedUnits },
    offline: false,
  });

  const administered = await deps.calculationRepository.update(record.calculationId, {
    state: "ADMINISTRATION_RECORDED",
    administeredUnits: request.administeredUnits,
    administeredAt: request.administeredAt,
  });
  return { ok: true, record: administered };
}

async function appendOrThrow(auditStore: AuditStore, event: Parameters<AuditStore["append"]>[0]): Promise<void> {
  await auditStore.append(event);
}

async function tryAppend(auditStore: AuditStore, event: Parameters<AuditStore["append"]>[0]): Promise<void> {
  try {
    await auditStore.append(event);
  } catch {
    // Non-blocking for state transitions that are not the primary confirmation gate.
  }
}
