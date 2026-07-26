import { Decimal } from "./decimal.js";
import { ValidationRefusal } from "./errors.js";
import { parseNumericSettings, validateSettings, type ParsedClinicianSettings } from "./settings.js";
import type {
  BolusCalculationRequest,
  ClinicianSettingsRecord,
  RefusalCode,
  SafetyContext,
} from "./types.js";

const ZERO = Decimal.fromInteger(0n);
export const GLUCOSE_FRESHNESS_LIMIT_MS = 15 * 60 * 1000;
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
const MILLISECONDS_PER_HOUR = 3_600_000;

export interface ParsedCalculationInput {
  readonly currentGlucose: Decimal;
  readonly carbohydrateGrams: Decimal;
  readonly calculatedAtMs: number;
  readonly activeInsulinUnits: Decimal | null;
}

export interface SafetyGatesPass {
  readonly allowed: true;
  readonly settings: ParsedClinicianSettings;
  readonly input: ParsedCalculationInput;
}

export interface SafetyGatesRefusal {
  readonly allowed: false;
  readonly refusalCode: RefusalCode;
}

export type SafetyGateResult = SafetyGatesPass | SafetyGatesRefusal;

function refuse(refusalCode: RefusalCode): SafetyGatesRefusal {
  return { allowed: false, refusalCode };
}

/** Deterministic self-test used by gate 1 (application integrity). */
function applicationIntegritySelfCheckPasses(): boolean {
  try {
    const total = Decimal.parse("4.25").roundHalfUpToIncrement(Decimal.parse("0.5"));
    return total.toCanonicalString() === "4.5";
  } catch {
    return false;
  }
}

function parseRequiredDecimal(value: string | undefined | null): Decimal {
  if (value === undefined || value === null || value === "") {
    throw new ValidationRefusal("MISSING_INPUT");
  }
  try {
    return Decimal.parse(value);
  } catch {
    throw new ValidationRefusal("INVALID_INPUT");
  }
}

function isFiniteTimestamp(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * runSafetyGates - handoff section 8.4. Executes gates 1-30 in order and fails
 * closed. Once a gate refuses, later arithmetic must not execute.
 */
export function runSafetyGates(
  settings: ClinicianSettingsRecord | undefined,
  request: BolusCalculationRequest,
  context: SafetyContext,
): SafetyGateResult {
  // Gate 1: application integrity
  if (!applicationIntegritySelfCheckPasses()) return refuse("APPLICATION_INTEGRITY_FAILURE");

  // Gate 2: authentication / patient binding
  if (!context.authenticatedPatientId) return refuse("UNAUTHENTICATED");
  if (context.authenticatedPatientId !== request.patientId) return refuse("PATIENT_MISMATCH");

  // Gates 3-5: missing active settings, lifecycle/integrity, invalid settings
  const settingsResult = validateSettings(settings, request.calculatedAt);
  if (!settingsResult.valid) return refuse(settingsResult.refusalCode);
  const parsedSettings = parseNumericSettings(settings as ClinicianSettingsRecord);

  try {
    // Gate 6: input schema (required fields present)
    if (
      request.mode === undefined ||
      request.currentGlucose === undefined ||
      request.carbohydrateGrams === undefined ||
      request.calculatedAt === undefined
    ) {
      throw new ValidationRefusal("MISSING_INPUT");
    }

    // Gate 7: glucose units
    if (request.glucoseUnit !== parsedSettings.record.glucoseUnit) {
      throw new ValidationRefusal("UNIT_MISMATCH");
    }

    // Gate 8: unconfirmed glucose
    if (request.glucoseConfirmed !== true) throw new ValidationRefusal("UNCONFIRMED_GLUCOSE");

    // Gate 9: unconfirmed carbohydrates
    if (request.carbohydratesConfirmed !== true) {
      throw new ValidationRefusal("UNCONFIRMED_CARBOHYDRATES");
    }

    // Gate 10: missing/ambiguous current glucose
    const currentGlucose = parseRequiredDecimal(request.currentGlucose);
    if (currentGlucose.compare(ZERO) <= 0) throw new ValidationRefusal("INVALID_INPUT");

    // Gate 11 / 12 / 13: glucose timestamp and clock integrity
    if (!isFiniteTimestamp(request.calculatedAt)) throw new ValidationRefusal("INVALID_INPUT");
    const calculatedAtMs = Date.parse(request.calculatedAt);
    if (!isFiniteTimestamp(request.glucoseTimestamp)) throw new ValidationRefusal("MISSING_INPUT");
    const glucoseTimestampMs = Date.parse(request.glucoseTimestamp);
    if (glucoseTimestampMs > calculatedAtMs) throw new ValidationRefusal("FUTURE_GLUCOSE_TIMESTAMP");
    if (calculatedAtMs - glucoseTimestampMs > GLUCOSE_FRESHNESS_LIMIT_MS) {
      throw new ValidationRefusal("STALE_GLUCOSE");
    }
    const serverNowMs = Date.parse(context.serverNow);
    if (!Number.isFinite(serverNowMs) || Math.abs(serverNowMs - calculatedAtMs) > CLOCK_SKEW_TOLERANCE_MS) {
      throw new ValidationRefusal("UNRELIABLE_DEVICE_TIME");
    }

    // Gate 14: invalid carbohydrate amount
    const carbohydrateGrams = parseRequiredDecimal(request.carbohydrateGrams);
    if (carbohydrateGrams.compare(ZERO) < 0) throw new ValidationRefusal("INVALID_INPUT");
    if (request.mode === "MEAL" && carbohydrateGrams.compare(ZERO) <= 0) {
      throw new ValidationRefusal("INVALID_INPUT");
    }
    if (request.mode === "CORRECTION_ONLY" && carbohydrateGrams.compare(ZERO) !== 0) {
      throw new ValidationRefusal("INVALID_INPUT");
    }

    // Gate 15: duplicate-event risk
    if (request.duplicateDose) throw new ValidationRefusal("DUPLICATE_EVENT_RISK");

    // Gate 16: recent history unavailable
    if (request.recentHistoryComplete !== true) {
      throw new ValidationRefusal("RECENT_BOLUS_HISTORY_INCOMPLETE");
    }

    // Gate 17: invalid / active insulin declaration
    let activeInsulinUnits: Decimal | null = null;
    if (request.activeInsulinUnits !== null && request.activeInsulinUnits !== undefined) {
      let parsedActive: Decimal;
      try {
        parsedActive = Decimal.parse(request.activeInsulinUnits);
      } catch {
        throw new ValidationRefusal("INVALID_INPUT");
      }
      if (parsedActive.compare(ZERO) < 0) throw new ValidationRefusal("INVALID_INPUT");
      if (parsedActive.compare(ZERO) > 0) throw new ValidationRefusal("ACTIVE_PRIOR_BOLUS");
      activeInsulinUnits = parsedActive;
    }

    // Gates 18-20: prior rapid-acting doses
    const durationMs = parsedSettings.insulinDurationHours.multiply(
      Decimal.fromInteger(BigInt(MILLISECONDS_PER_HOUR)),
    );
    for (const priorDose of request.priorRapidActingDoses) {
      let units: Decimal;
      try {
        units = Decimal.parse(priorDose.units);
      } catch {
        throw new ValidationRefusal("INVALID_INPUT");
      }
      if (units.compare(ZERO) <= 0 || !isFiniteTimestamp(priorDose.administeredAt)) {
        throw new ValidationRefusal("INVALID_INPUT");
      }
      const administeredAtMs = Date.parse(priorDose.administeredAt);
      const elapsedMs = calculatedAtMs - administeredAtMs;
      if (elapsedMs < 0) throw new ValidationRefusal("FUTURE_PRIOR_BOLUS");
      const elapsed = Decimal.fromInteger(BigInt(Math.round(elapsedMs)));
      if (elapsed.compare(durationMs) < 0) throw new ValidationRefusal("ACTIVE_PRIOR_BOLUS");
    }

    // Gate 21: severe hypoglycaemia / unconsciousness (emergency escalation)
    if (request.specialSituations.includes("UNCONSCIOUS_OR_UNABLE_TO_SWALLOW")) {
      throw new ValidationRefusal("HYPO_SYMPTOMS");
    }

    // Gate 22: hypo symptoms
    if (request.hypoSymptoms) throw new ValidationRefusal("HYPO_SYMPTOMS");

    // Gate 23: low glucose
    if (currentGlucose.compare(parsedSettings.lowGlucoseThreshold) <= 0) {
      throw new ValidationRefusal("HYPO_THRESHOLD");
    }

    // Gate 24: severe illness
    if (request.specialSituations.includes("SEVERE_ILLNESS") || request.specialSituations.includes("SICK_DAY")) {
      throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");
    }

    // Gate 25: vomiting / dehydration
    if (request.specialSituations.includes("VOMITING") || request.specialSituations.includes("DEHYDRATION")) {
      throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");
    }

    // Gate 26: ketones
    if (request.specialSituations.includes("KETONES")) throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");

    // Gate 27: paediatric use
    if (request.specialSituations.includes("PAEDIATRIC_USE") || context.patientIsAdult !== true) {
      throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");
    }

    // Gate 28: pregnancy
    if (request.specialSituations.includes("PREGNANCY")) throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");

    // Gate 29: concentrated insulin ambiguity
    if (
      request.specialSituations.includes("CONCENTRATED_INSULIN_AMBIGUITY") ||
      request.concentratedInsulinConfirmed !== true
    ) {
      throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");
    }

    // Gate 30: other excluded clinical context
    const otherExcluded: readonly string[] = [
      "PUMP_OR_AID",
      "BASAL_OR_PREMIXED_INSULIN",
      "EXERCISE_ADJUSTMENT",
      "ALCOHOL_ADJUSTMENT",
      "STEROID_ADJUSTMENT",
      "OTHER_TREATMENT_PLAN",
    ];
    if (request.specialSituations.some((situation) => otherExcluded.includes(situation))) {
      throw new ValidationRefusal("SPECIAL_CLINICAL_SITUATION");
    }

    return {
      allowed: true,
      settings: parsedSettings,
      input: { currentGlucose, carbohydrateGrams, calculatedAtMs, activeInsulinUnits },
    };
  } catch (error) {
    if (error instanceof ValidationRefusal) return refuse(error.refusalCode);
    return refuse("ARITHMETIC_FAILURE");
  }
}
