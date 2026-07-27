import { makeRequest } from "../fixtures/base-request.js";
import { makeSettings } from "../fixtures/base-settings.js";
import type { BolusCalculationRequest, ClinicianSettingsRecord, SafetyContext } from "../../src/types.js";

export interface ParityCase {
  readonly id: string;
  readonly description: string;
  /** null models "no active configuration for this patient." */
  readonly settings: ClinicianSettingsRecord | null;
  readonly request: BolusCalculationRequest;
  readonly context: SafetyContext;
}

const baseContext: SafetyContext = {
  authenticatedPatientId: "patient_123",
  patientIsAdult: true,
  serverNow: "2026-07-24T04:00:00.000Z",
};

function withContext(overrides: Partial<SafetyContext> = {}): SafetyContext {
  return { ...baseContext, ...overrides };
}

/**
 * The frozen golden-case grid for the parity harness (see
 * docs/UPGRADE-bolus-calc.md §3). Every case here is committed alongside
 * its captured snapshot in parity.test.ts - adding a case is always safe;
 * changing what an *existing* case id points to, or editing a snapshot, is
 * a "golden-case:"-prefixed commit reviewed under /CODEOWNERS, never a
 * routine change (see packages/bolus/FROZEN.md).
 */
export const PARITY_CASES: readonly ParityCase[] = [
  {
    id: "meal-standard-mmol",
    description: "Standard meal bolus, mid-range glucose, mmol/L, no modifiers",
    settings: makeSettings(),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "correction-only-standard",
    description: "Correction-only, glucose above target, zero carbohydrate",
    settings: makeSettings(),
    request: makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "0" }),
    context: withContext(),
  },
  {
    id: "meal-plus-correction-below-target",
    description: "Meal with current glucose below target - correction component is negative",
    settings: makeSettings(),
    request: makeRequest({ currentGlucose: "4" }),
    context: withContext(),
  },
  {
    id: "calculated-zero-clamp",
    description: "Combined total would be negative - clamps to CALCULATED_ZERO, never negative",
    settings: makeSettings({ icr: "1000", isf: "1000" }),
    request: makeRequest({ currentGlucose: "1", carbohydrateGrams: "1" }),
    context: withContext(),
  },
  {
    id: "rounding-edge-half-of-half-increment",
    description: "Unrounded total (2.75) is exactly a round-half-up tie against a 0.5 increment (quotient 5.5 -> 6 -> 3.0)",
    settings: makeSettings({ icr: "8", doseIncrementUnits: "0.5" }),
    request: makeRequest({ carbohydrateGrams: "22", currentGlucose: "6" }),
    context: withContext(),
  },
  {
    id: "rounding-edge-half-increment",
    description: "Unrounded total lands exactly on .5 of the dose increment",
    settings: makeSettings({ icr: "10", doseIncrementUnits: "1" }),
    request: makeRequest({ carbohydrateGrams: "45", currentGlucose: "6" }),
    context: withContext(),
  },
  {
    id: "maximum-dose-exceeded-rounded",
    description: "Rounded total exceeds maximumDoseUnits - refuses, never caps",
    settings: makeSettings({ maximumDoseUnits: "5" }),
    request: makeRequest({ carbohydrateGrams: "200" }),
    context: withContext(),
  },
  {
    id: "mgdl-configuration",
    description: "An independently-configured mg/dL patient, same formula shape",
    settings: makeSettings({
      glucoseUnit: "MG_DL",
      icr: "10",
      isf: "40",
      targetGlucose: "110",
      lowGlucoseThreshold: "70",
    }),
    request: makeRequest({ glucoseUnit: "MG_DL", currentGlucose: "180", carbohydrateGrams: "50" }),
    context: withContext(),
  },
  {
    id: "no-authenticated-patient",
    description: "Gate 2: no authenticated patient present",
    settings: makeSettings(),
    request: makeRequest(),
    context: withContext({ authenticatedPatientId: null }),
  },
  {
    id: "patient-mismatch",
    description: "Gate 2: authenticated identity does not match the request",
    settings: makeSettings(),
    request: makeRequest(),
    context: withContext({ authenticatedPatientId: "someone_else" }),
  },
  {
    id: "no-active-configuration",
    description: "Gates 3-5: no active configuration for this patient",
    settings: null,
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-revoked",
    description: "Gates 3-5: configuration has been revoked",
    settings: makeSettings({ status: "REVOKED", revokedAt: "2026-06-01T00:00:00.000Z" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "unit-mismatch",
    description: "Gate 7: request glucose unit does not match configuration's unit",
    settings: makeSettings({ glucoseUnit: "MMOL_L" }),
    request: makeRequest({ glucoseUnit: "MG_DL" }),
    context: withContext(),
  },
  {
    id: "unconfirmed-glucose",
    description: "Gate 8: glucose not explicitly confirmed by the user",
    settings: makeSettings(),
    request: makeRequest({ glucoseConfirmed: false }),
    context: withContext(),
  },
  {
    id: "unconfirmed-carbohydrates",
    description: "Gate 9: carbohydrates not explicitly confirmed by the user",
    settings: makeSettings(),
    request: makeRequest({ carbohydratesConfirmed: false }),
    context: withContext(),
  },
  {
    id: "invalid-current-glucose",
    description: "Gate 10: current glucose is zero/non-positive",
    settings: makeSettings(),
    request: makeRequest({ currentGlucose: "0" }),
    context: withContext(),
  },
  {
    id: "future-glucose-timestamp",
    description: "Gate 11-13: glucose timestamp is after the calculation time",
    settings: makeSettings(),
    request: makeRequest({ glucoseTimestamp: "2026-07-24T04:05:00.000Z" }),
    context: withContext(),
  },
  {
    id: "stale-glucose",
    description: "Gate 11-13: glucose reading is more than 15 minutes old",
    settings: makeSettings(),
    request: makeRequest({ glucoseTimestamp: "2026-07-24T03:40:00.000Z" }),
    context: withContext(),
  },
  {
    id: "glucose-freshness-boundary",
    description: "Gate 11-13: glucose reading is exactly at the 15-minute freshness boundary (permits)",
    settings: makeSettings(),
    request: makeRequest({ glucoseTimestamp: "2026-07-24T03:45:00.000Z" }),
    context: withContext(),
  },
  {
    id: "unreliable-device-time",
    description: "Gate 11-13: device clock disagrees with the trusted server clock",
    settings: makeSettings(),
    request: makeRequest(),
    context: withContext({ serverNow: "2026-07-24T04:20:00.000Z" }),
  },
  {
    id: "invalid-carb-zero-meal",
    description: "Gate 14: zero carbohydrate in MEAL mode is invalid",
    settings: makeSettings(),
    request: makeRequest({ carbohydrateGrams: "0" }),
    context: withContext(),
  },
  {
    id: "invalid-carb-nonzero-correction",
    description: "Gate 14: nonzero carbohydrate in CORRECTION_ONLY mode is invalid",
    settings: makeSettings(),
    request: makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "5" }),
    context: withContext(),
  },
  {
    id: "negative-carbohydrate",
    description: "Gate 14: negative carbohydrate amount",
    settings: makeSettings(),
    request: makeRequest({ carbohydrateGrams: "-5" }),
    context: withContext(),
  },
  {
    id: "duplicate-event-risk",
    description: "Gate 15: a dose may already have been taken for this event",
    settings: makeSettings(),
    request: makeRequest({ duplicateDose: true }),
    context: withContext(),
  },
  {
    id: "recent-history-incomplete",
    description: "Gate 16: patient has not confirmed recent bolus history is complete",
    settings: makeSettings(),
    request: makeRequest({ recentHistoryComplete: false }),
    context: withContext(),
  },
  {
    id: "negative-active-insulin",
    description: "Gate 17: negative activeInsulinUnits is an invalid declaration",
    settings: makeSettings(),
    request: makeRequest({ activeInsulinUnits: "-1" }),
    context: withContext(),
  },
  {
    id: "positive-active-insulin-lockout",
    description: "Gate 17: positive activeInsulinUnits is a hard lockout (C-01) - never subtracted",
    settings: makeSettings(),
    request: makeRequest({ activeInsulinUnits: "2" }),
    context: withContext(),
  },
  {
    id: "explicit-zero-active-insulin",
    description: "Gate 17: explicit zero activeInsulinUnits is accepted",
    settings: makeSettings(),
    request: makeRequest({ activeInsulinUnits: "0" }),
    context: withContext(),
  },
  {
    id: "prior-dose-invalid-record",
    description: "Gates 18-20: a prior dose record with non-positive units is invalid",
    settings: makeSettings(),
    request: makeRequest({ priorRapidActingDoses: [{ units: "0", administeredAt: "2026-07-24T02:00:00.000Z" }] }),
    context: withContext(),
  },
  {
    id: "prior-dose-future",
    description: "Gates 18-20: a prior dose recorded in the future",
    settings: makeSettings(),
    request: makeRequest({ priorRapidActingDoses: [{ units: "2", administeredAt: "2026-07-24T05:00:00.000Z" }] }),
    context: withContext(),
  },
  {
    id: "prior-dose-still-active",
    description: "Gates 18-20: a prior dose within the insulin duration window - refuses (no IOB subtraction exists)",
    settings: makeSettings({ insulinDurationHours: "4" }),
    request: makeRequest({ priorRapidActingDoses: [{ units: "3", administeredAt: "2026-07-24T02:30:00.000Z" }] }),
    context: withContext(),
  },
  {
    id: "prior-dose-exact-boundary",
    description: "Gates 18-20: a prior dose exactly at the duration boundary permits (elapsed >= duration)",
    settings: makeSettings({ insulinDurationHours: "4" }),
    request: makeRequest({ priorRapidActingDoses: [{ units: "3", administeredAt: "2026-07-24T00:00:00.000Z" }] }),
    context: withContext(),
  },
  {
    id: "hypo-symptoms",
    description: "Gate 21: hypoglycaemia symptoms present - refuses regardless of glucose value",
    settings: makeSettings(),
    request: makeRequest({ hypoSymptoms: true }),
    context: withContext(),
  },
  {
    id: "unconscious-emergency",
    description: "Gate 21: unconscious/unable to swallow - emergency escalation",
    settings: makeSettings(),
    request: makeRequest({ specialSituations: ["UNCONSCIOUS_OR_UNABLE_TO_SWALLOW"] }),
    context: withContext(),
  },
  {
    id: "low-glucose-at-threshold",
    description: "Glucose at or below the low threshold refuses",
    settings: makeSettings({ lowGlucoseThreshold: "4" }),
    request: makeRequest({ currentGlucose: "4" }),
    context: withContext(),
  },
  {
    id: "low-glucose-just-above-threshold",
    description: "Glucose immediately above the low threshold permits",
    settings: makeSettings({ lowGlucoseThreshold: "4" }),
    request: makeRequest({ currentGlucose: "4.1" }),
    context: withContext(),
  },
  {
    id: "paediatric-not-adult",
    description: "Paediatric/non-adult patient without explicit adult configuration refuses",
    settings: makeSettings(),
    request: makeRequest(),
    context: withContext({ patientIsAdult: false }),
  },
  {
    id: "concentrated-insulin-unconfirmed",
    description: "Concentrated-insulin use has not been explicitly confirmed",
    settings: makeSettings(),
    request: makeRequest({ concentratedInsulinConfirmed: false }),
    context: withContext(),
  },
  {
    id: "special-situation-sick-day",
    description: "SpecialSituation SICK_DAY refuses and escalates to the clinician-issued plan",
    settings: makeSettings(),
    request: makeRequest({ specialSituations: ["SICK_DAY"] }),
    context: withContext(),
  },
  {
    id: "special-situation-ketones",
    description: "SpecialSituation KETONES refuses (sick-day/ketone protocol, never app-managed)",
    settings: makeSettings(),
    request: makeRequest({ specialSituations: ["KETONES"] }),
    context: withContext(),
  },
  {
    id: "special-situation-pregnancy",
    description: "SpecialSituation PREGNANCY refuses (out of scope per the handoff)",
    settings: makeSettings(),
    request: makeRequest({ specialSituations: ["PREGNANCY"] }),
    context: withContext(),
  },
  {
    id: "special-situation-other-excluded",
    description: "SpecialSituation EXERCISE_ADJUSTMENT falls into the general excluded-situations catch-all",
    settings: makeSettings(),
    request: makeRequest({ specialSituations: ["EXERCISE_ADJUSTMENT"] }),
    context: withContext(),
  },
  {
    id: "configuration-not-active-draft",
    description: "Gates 3-5: configuration exists but is DRAFT, not ACTIVE",
    settings: makeSettings({ status: "DRAFT" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-expired",
    description: "Gates 3-5: configuration's expiresAt is before the calculation time",
    settings: makeSettings({ expiresAt: "2026-07-01T00:00:00.000Z" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-unsupported-schema-version",
    description: "Gates 3-5: configuration's schemaVersion is not in SUPPORTED_SCHEMA_VERSIONS",
    settings: makeSettings({ schemaVersion: "0.9" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-integrity-failure",
    description: "Gates 3-5: recomputed checksum does not match the stored checksum (tampered/corrupted settings)",
    settings: { ...makeSettings(), configurationChecksum: "0000000000000000000000000000000000000000000000000000000000000000" },
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-invalid-icr-zero",
    description: "Gates 3-5: ICR is zero - invalid configuration, never divides by zero",
    settings: makeSettings({ icr: "0" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-invalid-max-below-increment",
    description: "Gates 3-5: maximumDoseUnits is below doseIncrementUnits - invalid configuration",
    settings: makeSettings({ doseIncrementUnits: "5", maximumDoseUnits: "1" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-invalid-target-below-low-threshold",
    description: "Gates 3-5: targetGlucose is at/below lowGlucoseThreshold - invalid configuration",
    settings: makeSettings({ targetGlucose: "4", lowGlucoseThreshold: "5" }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "configuration-dia-not-patient-confirmed",
    description: "Gates 3-5: insulin duration is not confirmed as accurate by the patient (DIA provenance)",
    settings: makeSettings({ insulinDurationPatientConfirmedAccurate: false as unknown as true }),
    request: makeRequest(),
    context: withContext(),
  },
  {
    id: "multiple-prior-doses-all-cleared",
    description: "Several prior doses, all past the insulin-duration boundary - permits",
    settings: makeSettings({ insulinDurationHours: "4" }),
    request: makeRequest({
      priorRapidActingDoses: [
        { units: "2", administeredAt: "2026-07-23T20:00:00.000Z" },
        { units: "3", administeredAt: "2026-07-23T22:00:00.000Z" },
      ],
    }),
    context: withContext(),
  },
  {
    id: "meal-small-carb-high-icr",
    description: "A small carbohydrate amount against a high ICR - fractional meal component",
    settings: makeSettings({ icr: "15" }),
    request: makeRequest({ carbohydrateGrams: "6", currentGlucose: "6" }),
    context: withContext(),
  },
  {
    id: "correction-large-glucose-excursion",
    description: "Correction-only with a large glucose excursion above target",
    settings: makeSettings(),
    request: makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "0", currentGlucose: "22" }),
    context: withContext(),
  },
  {
    id: "meal-glucose-exactly-at-target",
    description: "Meal bolus with current glucose exactly equal to target - correction component is exactly zero",
    settings: makeSettings({ targetGlucose: "6" }),
    request: makeRequest({ currentGlucose: "6" }),
    context: withContext(),
  },
  {
    id: "maximum-dose-exceeded-unrounded-only",
    description: "Unrounded total exceeds maximumDoseUnits even though carbohydrate figure looks modest at a very tight ICR",
    settings: makeSettings({ icr: "1", maximumDoseUnits: "10" }),
    request: makeRequest({ carbohydrateGrams: "15", currentGlucose: "6" }),
    context: withContext(),
  },
  {
    id: "mgdl-low-glucose-refusal",
    description: "mg/dL configuration, glucose at the low threshold - refuses in the configured unit",
    settings: makeSettings({ glucoseUnit: "MG_DL", targetGlucose: "110", lowGlucoseThreshold: "70" }),
    request: makeRequest({ glucoseUnit: "MG_DL", currentGlucose: "70" }),
    context: withContext(),
  },
  {
    id: "mgdl-active-prior-bolus",
    description: "mg/dL configuration, a prior dose still within the insulin duration window",
    settings: makeSettings({ glucoseUnit: "MG_DL", targetGlucose: "110", lowGlucoseThreshold: "70", insulinDurationHours: "5" }),
    request: makeRequest({
      glucoseUnit: "MG_DL",
      currentGlucose: "180",
      priorRapidActingDoses: [{ units: "4", administeredAt: "2026-07-24T01:00:00.000Z" }],
    }),
    context: withContext(),
  },
  {
    id: "tight-dose-increment-pump",
    description:
      "Pump-style 0.05 U increment with an ICR (12) that yields a non-terminating exact fraction (37/12). " +
      "Previously refused with a misleading ARITHMETIC_FAILURE (see git history / FROZEN.md changelog for " +
      "this case's original golden snapshot): the max-dose check re-parses core.unroundedTotalUnits via " +
      "Decimal.parse after it was formatted via toCanonicalString(), and the two disagreed on how many " +
      "fraction digits are valid. Fixed by making toCanonicalString's default maxScale 6, matching " +
      "Decimal.parse's own format regex exactly, so that round-trip is always safe. This case's snapshot " +
      "was updated in the same golden-case: commit as that fix - it now correctly computes 3.6 U.",
    settings: makeSettings({ doseIncrementUnits: "0.05", icr: "12" }),
    request: makeRequest({ carbohydrateGrams: "37", currentGlucose: "7" }),
    context: withContext(),
  },
  {
    id: "large-pen-increment",
    description: "Pen-style coarse dose increment (1.0 U)",
    settings: makeSettings({ doseIncrementUnits: "1" }),
    request: makeRequest({ carbohydrateGrams: "40", currentGlucose: "9" }),
    context: withContext(),
  },
  {
    id: "correction-only-below-target-clamped",
    description:
      "Correction-only with glucose below target but above the low-glucose threshold - negative correction clamps to CALCULATED_ZERO rather than refusing",
    settings: makeSettings({ targetGlucose: "6", lowGlucoseThreshold: "4" }),
    request: makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "0", currentGlucose: "5" }),
    context: withContext(),
  },
];
