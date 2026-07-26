/**
 * Production types for the deterministic bolus module.
 *
 * Source of truth: BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md sections 2, 3, 5, 6.
 * This module must not depend on React, Supabase, Railway, service workers,
 * food databases, speech recognition, AI services, browser storage or network
 * access (handoff section 11).
 */

export const CALCULATOR_VERSION = "0.6.0";
export const SAFETY_POLICY_VERSION = "0.6.0";
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ["1.0"];

export type GlucoseUnit = "MMOL_L" | "MG_DL";
export type CalculationMode = "MEAL" | "CORRECTION_ONLY";
export type GlucoseSource = "FINGERSTICK" | "CGM" | "MANUAL_TRANSCRIPTION";
export type GlucoseTrend = "RISING" | "FALLING" | "STABLE" | "RISING_RAPIDLY" | "FALLING_RAPIDLY";

/** Closed special-situation enum - handoff section 3.1 (conflict C-04). */
export type SpecialSituation =
  | "SICK_DAY"
  | "SEVERE_ILLNESS"
  | "KETONES"
  | "VOMITING"
  | "DEHYDRATION"
  | "PREGNANCY"
  | "PAEDIATRIC_USE"
  | "EXERCISE_ADJUSTMENT"
  | "ALCOHOL_ADJUSTMENT"
  | "STEROID_ADJUSTMENT"
  | "PUMP_OR_AID"
  | "BASAL_OR_PREMIXED_INSULIN"
  | "CONCENTRATED_INSULIN_AMBIGUITY"
  | "UNCONSCIOUS_OR_UNABLE_TO_SWALLOW"
  | "OTHER_TREATMENT_PLAN";

export const SPECIAL_SITUATIONS: readonly SpecialSituation[] = [
  "SICK_DAY",
  "SEVERE_ILLNESS",
  "KETONES",
  "VOMITING",
  "DEHYDRATION",
  "PREGNANCY",
  "PAEDIATRIC_USE",
  "EXERCISE_ADJUSTMENT",
  "ALCOHOL_ADJUSTMENT",
  "STEROID_ADJUSTMENT",
  "PUMP_OR_AID",
  "BASAL_OR_PREMIXED_INSULIN",
  "CONCENTRATED_INSULIN_AMBIGUITY",
  "UNCONSCIOUS_OR_UNABLE_TO_SWALLOW",
  "OTHER_TREATMENT_PLAN",
];

export type ConfigurationStatus =
  | "DRAFT"
  | "APPROVED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "REVOKED"
  | "EXPIRED";

export type InsulinDurationEntrySource =
  | "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION"
  | "PATIENT_ENTERED_FROM_CLINICIAN_REPORT";

/** Handoff section 2.1 - immutable, versioned, patient-entered clinician-report settings. */
export interface ClinicianSettingsRecord {
  readonly id: string;
  readonly patientId: string;
  readonly version: number;
  readonly status: ConfigurationStatus;
  readonly schemaVersion: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly configurationChecksum: string;
  readonly createdAt: string;

  readonly insulinDurationEntrySource: InsulinDurationEntrySource;
  readonly insulinDurationSourceDate?: string;
  readonly insulinDurationSourceReference?: string;
  readonly insulinDurationEnteredAt: string;
  readonly insulinDurationPatientConfirmedAccurate: true;
  readonly insulinDurationPatientConfirmedAt: string;

  readonly icr: string;
  readonly isf: string;
  readonly targetGlucose: string;
  readonly insulinDurationHours: string;
  readonly doseIncrementUnits: string;
  readonly maximumDoseUnits: string;
  readonly lowGlucoseThreshold: string;
  readonly glucoseUnit: GlucoseUnit;
}

export interface PriorRapidActingDose {
  readonly units: string;
  readonly administeredAt: string;
}

/** Consolidated calculation input - handoff section 3 + section 8.5 request contract. */
export interface BolusCalculationRequest {
  readonly patientId: string;
  readonly configurationId: string;
  readonly mode: CalculationMode;

  readonly currentGlucose: string;
  readonly glucoseUnit: GlucoseUnit;
  readonly glucoseTimestamp: string;
  readonly glucoseSource: GlucoseSource;
  readonly glucoseConfirmed: boolean;
  readonly glucoseTrend?: GlucoseTrend | null;

  readonly carbohydrateGrams: string;
  readonly carbohydratesConfirmed: boolean;

  readonly activeInsulinUnits: string | null;
  readonly recentHistoryComplete: boolean;
  readonly priorRapidActingDoses: readonly PriorRapidActingDose[];

  readonly hypoSymptoms: boolean;
  readonly duplicateDose: boolean;
  readonly specialSituations: readonly SpecialSituation[];
  /** Explicit UI confirmation that the delivery device/insulin is standard (not concentrated). */
  readonly concentratedInsulinConfirmed: boolean;

  readonly calculatedAt: string;
}

export type RefusalCode =
  | "APPLICATION_INTEGRITY_FAILURE"
  | "UNAUTHENTICATED"
  | "PATIENT_MISMATCH"
  | "NO_ACTIVE_CONFIGURATION"
  | "CONFIGURATION_EXPIRED"
  | "CONFIGURATION_REVOKED"
  | "CONFIGURATION_INTEGRITY_FAILURE"
  | "UNSUPPORTED_CONFIGURATION_VERSION"
  | "INVALID_CONFIGURATION"
  | "MISSING_INPUT"
  | "INVALID_INPUT"
  | "UNIT_MISMATCH"
  | "UNCONFIRMED_GLUCOSE"
  | "UNCONFIRMED_CARBOHYDRATES"
  | "FUTURE_GLUCOSE_TIMESTAMP"
  | "STALE_GLUCOSE"
  | "UNRELIABLE_DEVICE_TIME"
  | "DUPLICATE_EVENT_RISK"
  | "RECENT_BOLUS_HISTORY_INCOMPLETE"
  | "FUTURE_PRIOR_BOLUS"
  | "ACTIVE_PRIOR_BOLUS"
  | "HYPO_SYMPTOMS"
  | "HYPO_THRESHOLD"
  | "SPECIAL_CLINICAL_SITUATION"
  | "MAXIMUM_DOSE_EXCEEDED"
  | "ARITHMETIC_FAILURE"
  | "AUDIT_PERSISTENCE_FAILURE"
  | "SNAPSHOT_MISMATCH";

export type RefusalCategory =
  | "CONFIGURATION"
  | "INPUT"
  | "GLUCOSE_SAFETY"
  | "ACTIVE_INSULIN"
  | "CLINICAL_CONTEXT"
  | "MAXIMUM_DOSE"
  | "INTEGRITY"
  | "CONFIRMATION";

export type WarningCode =
  | "OFFLINE_PENDING_SYNC"
  | "CALCULATION_NOT_ADMINISTRATION_PROOF"
  | "PROVENANCE_USER_ENTERED_OR_ESTIMATED";

export interface BolusSuccess {
  readonly status: "CALCULATED" | "CALCULATED_ZERO";
  readonly calculationId: string;

  readonly mealComponentUnits: string;
  readonly correctionComponentUnits: string;
  readonly activeInsulinAdjustmentUnits: "0";
  readonly unroundedTotalUnits: string;
  readonly roundedTotalUnits: string;

  readonly doseIncrementUnits: string;
  readonly maximumDoseUnits: string;
  readonly warnings: readonly WarningCode[];
  readonly explanation: readonly string[];

  readonly settingsId: string;
  readonly settingsVersion: number;
  readonly calculationVersion: string;
  readonly safetyPolicyVersion: string;
  readonly timestamp: string;
  readonly expiresAt: string;
  readonly snapshotHash: string;
  readonly confirmationRequired: true;
}

export interface BolusRefusal {
  readonly status: "REFUSED";
  readonly refusalCode: RefusalCode;
  readonly refusalCategory: RefusalCategory;
  readonly userFacingMessage: string;
  readonly blockingReason: string;
  readonly safeNextStep: string;
  readonly settingsId?: string;
  readonly settingsVersion?: number;
  readonly calculationVersion: string;
  readonly safetyPolicyVersion: string;
  readonly timestamp: string;
}

export type BolusPreviewResult = BolusSuccess | BolusRefusal;

export interface SettingsValidationSuccess {
  readonly valid: true;
  readonly configurationId: string;
  readonly version: number;
  readonly checksumVerified: true;
}

export interface SettingsValidationFailure {
  readonly valid: false;
  readonly refusalCode: RefusalCode;
  readonly message: string;
}

export type SettingsValidationResult = SettingsValidationSuccess | SettingsValidationFailure;

/** Safety-context data supplied by the authenticated request wrapper, never by request JSON. */
export interface SafetyContext {
  readonly authenticatedPatientId: string | null;
  readonly patientIsAdult: boolean;
  /** Trusted server clock, RFC 3339, used for skew and freshness checks. */
  readonly serverNow: string;
}
