import { randomUUID } from "node:crypto";
import {
  computeConfigurationChecksum,
  type CalculationRecord,
  type CalculationRepository,
  type ClinicianSettingsRecord,
  type SettingsRepository,
} from "@diabetes-companion/bolus";

/**
 * In-memory repositories for local development only. Handoff conflict C-05:
 * production deployments must use durable, transactional persistence - see
 * src/repositories/supabase.ts. This store is process-local and is lost on
 * restart; it must never be used in production.
 */

export interface NewSettingsInput {
  readonly patientId: string;
  readonly icr: string;
  readonly isf: string;
  readonly targetGlucose: string;
  readonly insulinDurationHours: string;
  readonly doseIncrementUnits: string;
  readonly maximumDoseUnits: string;
  readonly lowGlucoseThreshold: string;
  readonly glucoseUnit: "MMOL_L" | "MG_DL";
  readonly insulinDurationEntrySource:
    | "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION"
    | "PATIENT_ENTERED_FROM_CLINICIAN_REPORT";
  readonly insulinDurationSourceDate?: string;
  readonly insulinDurationSourceReference?: string;
  readonly insulinDurationPatientConfirmedAccurate: true;
}

export class MemorySettingsRepository implements SettingsRepository {
  private readonly byPatient = new Map<string, ClinicianSettingsRecord[]>();

  async getActiveSettings(patientId: string): Promise<ClinicianSettingsRecord | undefined> {
    const history = this.byPatient.get(patientId) ?? [];
    return history.find((record) => record.status === "ACTIVE");
  }

  async getById(configurationId: string): Promise<ClinicianSettingsRecord | undefined> {
    for (const history of this.byPatient.values()) {
      const found = history.find((record) => record.id === configurationId);
      if (found) return found;
    }
    return undefined;
  }

  async getHistory(patientId: string): Promise<readonly ClinicianSettingsRecord[]> {
    return [...(this.byPatient.get(patientId) ?? [])].sort((a, b) => b.version - a.version);
  }

  /**
   * Creates a new, immutable settings version and supersedes the previous
   * active version atomically (handoff section 2.1 / section 4 conflict C-10).
   */
  async createVersion(input: NewSettingsInput, now: string): Promise<ClinicianSettingsRecord> {
    const history = this.byPatient.get(input.patientId) ?? [];
    const previousActive = history.find((record) => record.status === "ACTIVE");
    const nextVersion = history.length > 0 ? Math.max(...history.map((r) => r.version)) + 1 : 1;

    const base = {
      patientId: input.patientId,
      version: nextVersion,
      icr: input.icr,
      isf: input.isf,
      targetGlucose: input.targetGlucose,
      insulinDurationHours: input.insulinDurationHours,
      doseIncrementUnits: input.doseIncrementUnits,
      maximumDoseUnits: input.maximumDoseUnits,
      lowGlucoseThreshold: input.lowGlucoseThreshold,
      glucoseUnit: input.glucoseUnit,
      insulinDurationEntrySource: input.insulinDurationEntrySource,
      insulinDurationSourceDate: input.insulinDurationSourceDate,
      insulinDurationSourceReference: input.insulinDurationSourceReference,
      insulinDurationEnteredAt: now,
      insulinDurationPatientConfirmedAccurate: input.insulinDurationPatientConfirmedAccurate,
      insulinDurationPatientConfirmedAt: now,
      schemaVersion: "1.0",
    };
    const configurationChecksum = computeConfigurationChecksum(base);

    const record: ClinicianSettingsRecord = {
      ...base,
      id: randomUUID(),
      status: "ACTIVE",
      effectiveAt: now,
      createdAt: now,
      configurationChecksum,
    };

    const updatedHistory = history.map((existing) =>
      previousActive && existing.id === previousActive.id
        ? { ...existing, status: "SUPERSEDED" as const, supersededAt: now }
        : existing,
    );
    updatedHistory.push(record);
    this.byPatient.set(input.patientId, updatedHistory);
    return record;
  }
}

export class MemoryCalculationRepository implements CalculationRepository {
  private readonly records = new Map<string, CalculationRecord>();

  async save(record: CalculationRecord): Promise<void> {
    this.records.set(record.calculationId, record);
  }

  async get(calculationId: string): Promise<CalculationRecord | undefined> {
    return this.records.get(calculationId);
  }

  async update(calculationId: string, patch: Partial<CalculationRecord>): Promise<CalculationRecord> {
    const existing = this.records.get(calculationId);
    if (!existing) throw new Error("Calculation not found");
    const updated = { ...existing, ...patch };
    this.records.set(calculationId, updated);
    return updated;
  }

  async listByPatient(patientId: string): Promise<readonly CalculationRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.patientId === patientId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
