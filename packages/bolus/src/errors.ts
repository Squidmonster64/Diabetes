import type { RefusalCategory, RefusalCode } from "./types.js";

interface RefusalTemplate {
  readonly refusalCategory: RefusalCategory;
  readonly userFacingMessage: string;
  readonly blockingReason: string;
  readonly safeNextStep: string;
}

const GENERIC_SAFE_NEXT_STEP =
  "Follow the clinician-approved plan or contact the treating team.";

/**
 * User-facing wording and category mapping for every refusal code, transcribed
 * verbatim from BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 5.
 */
export const REFUSAL_TEMPLATES: Record<RefusalCode, RefusalTemplate> = {
  APPLICATION_INTEGRITY_FAILURE: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "Calculator integrity could not be verified. No calculation was produced.",
    blockingReason: "The calculator failed a self-verification check before running.",
    safeNextStep: GENERIC_SAFE_NEXT_STEP,
  },
  UNAUTHENTICATED: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "This calculation is not available for this account.",
    blockingReason: "No authenticated patient identity was supplied.",
    safeNextStep: "Sign in again and retry.",
  },
  PATIENT_MISMATCH: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "This calculation is not available for this account.",
    blockingReason: "The authenticated identity does not match the requested patient record.",
    safeNextStep: "Sign in again and retry.",
  },
  NO_ACTIVE_CONFIGURATION: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage: "No active clinician-supplied calculator settings are available.",
    blockingReason: "No settings version with status ACTIVE was found for this patient.",
    safeNextStep: "Enter patient-entered settings copied from your current clinician-approved plan.",
  },
  CONFIGURATION_EXPIRED: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage: "The clinical settings cannot be verified. No calculation was produced.",
    blockingReason: "The active settings version has expired.",
    safeNextStep: "Re-enter and confirm current settings from your clinician-approved plan.",
  },
  CONFIGURATION_REVOKED: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage: "The clinical settings cannot be verified. No calculation was produced.",
    blockingReason: "The active settings version has been revoked.",
    safeNextStep: "Re-enter and confirm current settings from your clinician-approved plan.",
  },
  CONFIGURATION_INTEGRITY_FAILURE: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage: "The clinical settings cannot be verified. No calculation was produced.",
    blockingReason: "The stored settings checksum does not match the recomputed checksum.",
    safeNextStep: "Re-enter and confirm current settings from your clinician-approved plan.",
  },
  UNSUPPORTED_CONFIGURATION_VERSION: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage: "The clinical settings cannot be verified. No calculation was produced.",
    blockingReason: "The settings schema version is not supported by this calculator version.",
    safeNextStep: "Update the application or contact support.",
  },
  INVALID_CONFIGURATION: {
    refusalCategory: "CONFIGURATION",
    userFacingMessage:
      "The calculator settings are incomplete, invalid, or not confirmed from current clinician advice.",
    blockingReason: "One or more clinician-supplied settings values failed validation.",
    safeNextStep: "Re-enter and confirm current settings from your clinician-approved plan.",
  },
  MISSING_INPUT: {
    refusalCategory: "INPUT",
    userFacingMessage: "One or more required values are missing or invalid.",
    blockingReason: "A required calculation input was missing.",
    safeNextStep: "Enter and confirm all required values, then try again.",
  },
  INVALID_INPUT: {
    refusalCategory: "INPUT",
    userFacingMessage: "One or more required values are missing or invalid.",
    blockingReason: "A calculation input failed format or range validation.",
    safeNextStep: "Enter and confirm all required values, then try again.",
  },
  UNIT_MISMATCH: {
    refusalCategory: "INPUT",
    userFacingMessage: "The glucose units do not match the clinician settings.",
    blockingReason: "The submitted glucose unit differs from the active configuration unit.",
    safeNextStep: "Re-enter the glucose value using the configured unit.",
  },
  UNCONFIRMED_GLUCOSE: {
    refusalCategory: "INPUT",
    userFacingMessage: "Confirm the current glucose value before calculating.",
    blockingReason: "The glucose value was not explicitly confirmed by the user.",
    safeNextStep: "Review and confirm the glucose value.",
  },
  UNCONFIRMED_CARBOHYDRATES: {
    refusalCategory: "INPUT",
    userFacingMessage: "Confirm the carbohydrate grams before calculating.",
    blockingReason: "The carbohydrate amount was not explicitly confirmed by the user.",
    safeNextStep: "Review and confirm the carbohydrate amount.",
  },
  FUTURE_GLUCOSE_TIMESTAMP: {
    refusalCategory: "INPUT",
    userFacingMessage:
      "The glucose timestamp is in the future. Check the device time and measurement.",
    blockingReason: "The glucose measurement timestamp is later than the calculation time.",
    safeNextStep: "Check device time and obtain a current glucose reading.",
  },
  STALE_GLUCOSE: {
    refusalCategory: "INPUT",
    userFacingMessage:
      "The glucose value is too old for this calculation. Obtain and confirm a current reading.",
    blockingReason: "The glucose measurement is older than the configured freshness limit.",
    safeNextStep: "Obtain and confirm a current glucose reading.",
  },
  UNRELIABLE_DEVICE_TIME: {
    refusalCategory: "INPUT",
    userFacingMessage: "The device time cannot be verified. No calculation was produced.",
    blockingReason: "The device clock could not be validated against the trusted server clock.",
    safeNextStep: "Check the device date, time and timezone, then try again.",
  },
  DUPLICATE_EVENT_RISK: {
    refusalCategory: "INPUT",
    userFacingMessage: "A dose may already have been taken for this event. No calculation was produced.",
    blockingReason: "The user indicated a dose may already have been taken for this event.",
    safeNextStep: GENERIC_SAFE_NEXT_STEP,
  },
  RECENT_BOLUS_HISTORY_INCOMPLETE: {
    refusalCategory: "INPUT",
    userFacingMessage: "Recent rapid-acting insulin history is incomplete. No calculation was produced.",
    blockingReason: "The user could not confirm recent rapid-acting insulin history is complete.",
    safeNextStep: "Confirm recent insulin history, or contact the treating team.",
  },
  FUTURE_PRIOR_BOLUS: {
    refusalCategory: "INPUT",
    userFacingMessage:
      "A recent insulin timestamp is in the future. Check the dose history and device time.",
    blockingReason: "A recorded prior dose timestamp is later than the calculation time.",
    safeNextStep: "Check the dose history and device time.",
  },
  ACTIVE_PRIOR_BOLUS: {
    refusalCategory: "ACTIVE_INSULIN",
    userFacingMessage:
      "Calculation unavailable because a previous rapid-acting dose may still be active.",
    blockingReason:
      "A prior rapid-acting dose occurred within the clinician-configured insulin duration. This calculator does not estimate insulin-on-board.",
    safeNextStep: GENERIC_SAFE_NEXT_STEP,
  },
  HYPO_SYMPTOMS: {
    refusalCategory: "GLUCOSE_SAFETY",
    userFacingMessage: "No bolus calculation was provided. Follow the established hypo plan.",
    blockingReason: "The user declared hypoglycaemia symptoms or an inability to safely proceed.",
    safeNextStep:
      "Follow your established hypo plan. If this is an emergency, seek urgent assistance or contact local emergency services.",
  },
  HYPO_THRESHOLD: {
    refusalCategory: "GLUCOSE_SAFETY",
    userFacingMessage:
      "The glucose value is at or below the clinician-configured low threshold. Follow the established hypo plan.",
    blockingReason: "Current glucose is at or below the configured low-glucose threshold.",
    safeNextStep: "Follow your established hypo plan.",
  },
  SPECIAL_CLINICAL_SITUATION: {
    refusalCategory: "CLINICAL_CONTEXT",
    userFacingMessage: "This calculation is outside the configured scope. Follow the established clinical plan.",
    blockingReason: "A declared special clinical situation is outside this calculator's scope.",
    safeNextStep: GENERIC_SAFE_NEXT_STEP,
  },
  MAXIMUM_DOSE_EXCEEDED: {
    refusalCategory: "MAXIMUM_DOSE",
    userFacingMessage:
      "The calculated amount exceeds the clinician-configured maximum. No dose was produced.",
    blockingReason: "The raw or rounded dose exceeds the clinician-configured maximum dose.",
    safeNextStep: GENERIC_SAFE_NEXT_STEP,
  },
  ARITHMETIC_FAILURE: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "The calculation could not be completed safely. No dose was produced.",
    blockingReason: "An unexpected arithmetic or parsing failure occurred during calculation.",
    safeNextStep: "Try again. If the problem continues, contact support.",
  },
  AUDIT_PERSISTENCE_FAILURE: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "The calculation could not be recorded safely. No result was displayed.",
    blockingReason: "The audit trail could not be durably persisted before the result was displayed.",
    safeNextStep: "Try again. If the problem continues, contact support.",
  },
  SNAPSHOT_MISMATCH: {
    refusalCategory: "INTEGRITY",
    userFacingMessage: "The calculation review cannot be verified. Recalculate.",
    blockingReason: "The review snapshot could not be verified or was rebuilt with different inputs.",
    safeNextStep: "Recalculate using current values.",
  },
};

export class ValidationRefusal extends Error {
  constructor(readonly refusalCode: RefusalCode) {
    super(refusalCode);
    this.name = "ValidationRefusal";
  }
}
