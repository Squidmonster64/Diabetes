import { computeConfigurationChecksum } from "../../src/settings.js";
import type { ClinicianSettingsRecord } from "../../src/types.js";

/**
 * Base configuration for expected examples - handoff section 10, base config.
 */
export function makeSettings(overrides: Partial<ClinicianSettingsRecord> = {}): ClinicianSettingsRecord {
  const base = {
    id: "cfg_123",
    patientId: "patient_123",
    version: 1,
    status: "ACTIVE" as const,
    schemaVersion: "1.0",
    effectiveAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    insulinDurationEntrySource: "PATIENT_ENTERED_FROM_CLINICIAN_REPORT" as const,
    insulinDurationSourceDate: "2025-12-01",
    insulinDurationSourceReference: "Clinic letter December 2025",
    insulinDurationEnteredAt: "2026-01-01T00:00:00.000Z",
    insulinDurationPatientConfirmedAccurate: true as const,
    insulinDurationPatientConfirmedAt: "2026-01-01T00:00:00.000Z",
    icr: "10",
    isf: "2",
    targetGlucose: "6",
    insulinDurationHours: "4",
    doseIncrementUnits: "0.5",
    maximumDoseUnits: "20",
    lowGlucoseThreshold: "4",
    glucoseUnit: "MMOL_L" as const,
    ...overrides,
  };
  const configurationChecksum = overrides.configurationChecksum ?? computeConfigurationChecksum(base);
  return { ...base, configurationChecksum };
}
