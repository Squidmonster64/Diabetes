import { describe, expect, it, beforeEach } from "vitest";
import { calculateBolusPreview } from "../src/calculations.js";
import { confirmBolus, rejectBolusPreview, logConfirmedBolus } from "../src/confirmation.js";
import {
  InMemoryAuditStore,
  InMemoryCalculationRepository,
  InMemorySettingsRepository,
} from "../src/repositories.js";
import type { BolusSuccess, SafetyContext } from "../src/types.js";
import { makeSettings } from "./fixtures/base-settings.js";
import { makeRequest } from "./fixtures/base-request.js";

const context: SafetyContext = {
  authenticatedPatientId: "patient_123",
  patientIsAdult: true,
  serverNow: "2026-07-24T04:00:00.000Z",
};

async function makeConfirmablePreview() {
  const settingsRepository = new InMemorySettingsRepository();
  const auditStore = new InMemoryAuditStore();
  const calculationRepository = new InMemoryCalculationRepository();
  settingsRepository.set(makeSettings());
  const deps = {
    settingsRepository,
    auditStore,
    calculationRepository,
    clock: { now: () => "2026-07-24T04:00:00.000Z" },
    idGenerator: { newId: () => "calc_confirm_test" },
  };
  const result = (await calculateBolusPreview(makeRequest(), context, deps)) as BolusSuccess;
  return { result, auditStore, calculationRepository };
}

describe("confirmBolus", () => {
  it("confirms a valid, unexpired preview exactly once", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.record.state).toBe("USER_CONFIRMED");
  });

  it("rejects confirmation from a different patient (PATIENT_MISMATCH)", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "someone_else",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "PATIENT_MISMATCH" });
  });

  it("accepts confirmation exactly at the five-minute expiry boundary (C-07)", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: result.expiresAt,
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    expect(response.ok).toBe(true);
  });

  it("rejects confirmation one millisecond after expiry", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const oneMsLater = new Date(Date.parse(result.expiresAt) + 1).toISOString();
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: oneMsLater,
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "CALCULATION_EXPIRED" });
  });

  it("rejects a changed snapshot hash", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: "sha256:wrong",
      },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "SNAPSHOT_MISMATCH" });
  });

  it("rejects a second confirmation of the same calculation (idempotent, no duplicate record)", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const request = {
      calculationId: result.calculationId,
      patientId: "patient_123",
      confirmed: true as const,
      confirmationTextAccepted: true as const,
      confirmedAt: "2026-07-24T04:02:00.000Z",
      expectedSnapshotHash: result.snapshotHash,
    };
    const first = await confirmBolus(request, { auditStore, calculationRepository });
    const second = await confirmBolus(request, { auditStore, calculationRepository });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "DUPLICATE_CONFIRMATION" });
  });

  it("rejects confirmation of an invalidated preview", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    await rejectBolusPreview(
      { calculationId: result.calculationId, patientId: "patient_123", rejectedAt: "2026-07-24T04:01:00.000Z", reason: "USER_REJECTED" },
      { auditStore, calculationRepository },
    );
    const response = await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "CALCULATION_INVALIDATED" });
  });

  it("rejects confirmation of an unknown calculation", async () => {
    const auditStore = new InMemoryAuditStore();
    const calculationRepository = new InMemoryCalculationRepository();
    const response = await confirmBolus(
      {
        calculationId: "does-not-exist",
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: "sha256:whatever",
      },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("logConfirmedBolus", () => {
  it("records an administered dose that may differ from the calculated dose", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    const response = await logConfirmedBolus(
      { calculationId: result.calculationId, patientId: "patient_123", administeredUnits: "5.5", administeredAt: "2026-07-24T04:06:00.000Z" },
      { auditStore, calculationRepository },
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.record.administeredUnits).toBe("5.5");
      expect(response.record.state).toBe("ADMINISTRATION_RECORDED");
    }
  });

  it("rejects administration before confirmation", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    const response = await logConfirmedBolus(
      { calculationId: result.calculationId, patientId: "patient_123", administeredUnits: "5.5", administeredAt: "2026-07-24T04:06:00.000Z" },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "NOT_CONFIRMABLE" });
  });

  it("rejects an invalid administration amount", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    const response = await logConfirmedBolus(
      { calculationId: result.calculationId, patientId: "patient_123", administeredUnits: "0", administeredAt: "2026-07-24T04:06:00.000Z" },
      { auditStore, calculationRepository },
    );
    expect(response).toMatchObject({ ok: false, code: "INVALID_ADMINISTRATION" });
  });

  it("rejects a repeated administration attempt", async () => {
    const { result, auditStore, calculationRepository } = await makeConfirmablePreview();
    await confirmBolus(
      {
        calculationId: result.calculationId,
        patientId: "patient_123",
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: "2026-07-24T04:02:00.000Z",
        expectedSnapshotHash: result.snapshotHash,
      },
      { auditStore, calculationRepository },
    );
    await logConfirmedBolus(
      { calculationId: result.calculationId, patientId: "patient_123", administeredUnits: "5.5", administeredAt: "2026-07-24T04:06:00.000Z" },
      { auditStore, calculationRepository },
    );
    const second = await logConfirmedBolus(
      { calculationId: result.calculationId, patientId: "patient_123", administeredUnits: "5.5", administeredAt: "2026-07-24T04:07:00.000Z" },
      { auditStore, calculationRepository },
    );
    expect(second).toMatchObject({ ok: false, code: "NOT_CONFIRMABLE" });
  });
});
