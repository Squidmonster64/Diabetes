import { createHash } from "node:crypto";
import { Decimal } from "./decimal.js";
import { ValidationRefusal } from "./errors.js";
import {
  SUPPORTED_SCHEMA_VERSIONS,
  type ClinicianSettingsRecord,
  type SettingsValidationResult,
} from "./types.js";

const ZERO = Decimal.fromInteger(0n);

/**
 * Canonical checksum of the clinical fields of a settings version. Computed by
 * the API layer when a new version is created, and re-verified here on every
 * calculation (handoff gate 4: settings lifecycle/integrity).
 */
export function computeConfigurationChecksum(
  settings: Pick<
    ClinicianSettingsRecord,
    | "patientId"
    | "version"
    | "icr"
    | "isf"
    | "targetGlucose"
    | "insulinDurationHours"
    | "doseIncrementUnits"
    | "maximumDoseUnits"
    | "lowGlucoseThreshold"
    | "glucoseUnit"
    | "insulinDurationEntrySource"
    | "insulinDurationSourceDate"
    | "insulinDurationSourceReference"
    | "insulinDurationEnteredAt"
    | "insulinDurationPatientConfirmedAccurate"
    | "insulinDurationPatientConfirmedAt"
    | "schemaVersion"
  >,
): string {
  const canonical = {
    patientId: settings.patientId,
    version: settings.version,
    icr: settings.icr,
    isf: settings.isf,
    targetGlucose: settings.targetGlucose,
    insulinDurationHours: settings.insulinDurationHours,
    doseIncrementUnits: settings.doseIncrementUnits,
    maximumDoseUnits: settings.maximumDoseUnits,
    lowGlucoseThreshold: settings.lowGlucoseThreshold,
    glucoseUnit: settings.glucoseUnit,
    insulinDurationEntrySource: settings.insulinDurationEntrySource,
    insulinDurationSourceDate: settings.insulinDurationSourceDate ?? null,
    insulinDurationSourceReference: settings.insulinDurationSourceReference ?? null,
    insulinDurationEnteredAt: settings.insulinDurationEnteredAt,
    insulinDurationPatientConfirmedAccurate: settings.insulinDurationPatientConfirmedAccurate,
    insulinDurationPatientConfirmedAt: settings.insulinDurationPatientConfirmedAt,
    schemaVersion: settings.schemaVersion,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export interface ParsedClinicianSettings {
  readonly record: ClinicianSettingsRecord;
  readonly icr: Decimal;
  readonly isf: Decimal;
  readonly targetGlucose: Decimal;
  readonly insulinDurationHours: Decimal;
  readonly doseIncrementUnits: Decimal;
  readonly maximumDoseUnits: Decimal;
  readonly lowGlucoseThreshold: Decimal;
}

/**
 * validateSettings - handoff section 8.1. Runs gates 3, 4 and 5 (missing
 * active settings; lifecycle/integrity; missing/invalid settings including DIA
 * provenance).
 */
export function validateSettings(
  settings: ClinicianSettingsRecord | undefined,
  at: string,
): SettingsValidationResult {
  if (!settings) {
    return { valid: false, refusalCode: "NO_ACTIVE_CONFIGURATION", message: "No active clinician-supplied calculator settings are available." };
  }
  if (settings.status === "REVOKED") {
    return { valid: false, refusalCode: "CONFIGURATION_REVOKED", message: "The clinician settings have been revoked." };
  }
  if (settings.status !== "ACTIVE") {
    return { valid: false, refusalCode: "NO_ACTIVE_CONFIGURATION", message: "The clinician settings are not active." };
  }
  const atMs = Date.parse(at);
  if (settings.expiresAt && Date.parse(settings.expiresAt) < atMs) {
    return { valid: false, refusalCode: "CONFIGURATION_EXPIRED", message: "The clinician settings have expired." };
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(settings.schemaVersion)) {
    return { valid: false, refusalCode: "UNSUPPORTED_CONFIGURATION_VERSION", message: "The settings schema version is not supported." };
  }
  const recomputedChecksum = computeConfigurationChecksum(settings);
  if (recomputedChecksum !== settings.configurationChecksum) {
    return { valid: false, refusalCode: "CONFIGURATION_INTEGRITY_FAILURE", message: "The clinical settings cannot be verified." };
  }

  try {
    const parsed = parseNumericSettings(settings);
    if (
      parsed.icr.compare(ZERO) <= 0 ||
      parsed.isf.compare(ZERO) <= 0 ||
      parsed.insulinDurationHours.compare(ZERO) <= 0 ||
      parsed.doseIncrementUnits.compare(ZERO) <= 0 ||
      parsed.maximumDoseUnits.compare(ZERO) <= 0 ||
      parsed.maximumDoseUnits.compare(parsed.doseIncrementUnits) < 0 ||
      parsed.targetGlucose.compare(parsed.lowGlucoseThreshold) <= 0
    ) {
      throw new ValidationRefusal("INVALID_CONFIGURATION");
    }
  } catch {
    return { valid: false, refusalCode: "INVALID_CONFIGURATION", message: "The calculator settings are incomplete or invalid." };
  }

  if (
    (settings.insulinDurationEntrySource !== "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION" &&
      settings.insulinDurationEntrySource !== "PATIENT_ENTERED_FROM_CLINICIAN_REPORT") ||
    settings.insulinDurationPatientConfirmedAccurate !== true ||
    !settings.insulinDurationPatientConfirmedAt ||
    !Number.isFinite(Date.parse(settings.insulinDurationPatientConfirmedAt))
  ) {
    return {
      valid: false,
      refusalCode: "INVALID_CONFIGURATION",
      message: "Insulin duration is not confirmed from current clinician advice.",
    };
  }

  return { valid: true, configurationId: settings.id, version: settings.version, checksumVerified: true };
}

export function parseNumericSettings(settings: ClinicianSettingsRecord): ParsedClinicianSettings {
  return {
    record: settings,
    icr: Decimal.parse(settings.icr),
    isf: Decimal.parse(settings.isf),
    targetGlucose: Decimal.parse(settings.targetGlucose),
    insulinDurationHours: Decimal.parse(settings.insulinDurationHours),
    doseIncrementUnits: Decimal.parse(settings.doseIncrementUnits),
    maximumDoseUnits: Decimal.parse(settings.maximumDoseUnits),
    lowGlucoseThreshold: Decimal.parse(settings.lowGlucoseThreshold),
  };
}
