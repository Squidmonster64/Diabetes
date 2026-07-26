import { describe, expect, it } from "vitest";
import { runSafetyGates } from "../src/safety.js";
import type { SafetyContext } from "../src/types.js";
import { makeSettings } from "./fixtures/base-settings.js";
import { makeRequest } from "./fixtures/base-request.js";

const context: SafetyContext = {
  authenticatedPatientId: "patient_123",
  patientIsAdult: true,
  serverNow: "2026-07-24T04:00:00.000Z",
};

describe("runSafetyGates", () => {
  it("allows a valid meal request through", () => {
    const result = runSafetyGates(makeSettings(), makeRequest(), context);
    expect(result.allowed).toBe(true);
  });

  it("refuses when no authenticated patient is present", () => {
    const result = runSafetyGates(makeSettings(), makeRequest(), { ...context, authenticatedPatientId: null });
    expect(result).toMatchObject({ allowed: false, refusalCode: "UNAUTHENTICATED" });
  });

  it("refuses when authenticated identity does not match the request", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ patientId: "someone_else" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "PATIENT_MISMATCH" });
  });

  it("refuses with no active configuration", () => {
    const result = runSafetyGates(undefined, makeRequest(), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "NO_ACTIVE_CONFIGURATION" });
  });

  it("refuses invalid configuration before touching input", () => {
    const bad = makeSettings({ icr: "0" });
    const result = runSafetyGates({ ...bad, configurationChecksum: "deliberately-wrong" }, makeRequest(), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "CONFIGURATION_INTEGRITY_FAILURE" });
  });

  it("refuses mismatched glucose units", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ glucoseUnit: "MG_DL" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "UNIT_MISMATCH" });
  });

  it("refuses unconfirmed glucose", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ glucoseConfirmed: false }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "UNCONFIRMED_GLUCOSE" });
  });

  it("refuses unconfirmed carbohydrates", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ carbohydratesConfirmed: false }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "UNCONFIRMED_CARBOHYDRATES" });
  });

  it("refuses missing/ambiguous current glucose", () => {
    expect(runSafetyGates(makeSettings(), makeRequest({ currentGlucose: "0" }), context)).toMatchObject({
      allowed: false,
      refusalCode: "INVALID_INPUT",
    });
    expect(runSafetyGates(makeSettings(), makeRequest({ currentGlucose: "abc" }), context)).toMatchObject({
      allowed: false,
      refusalCode: "INVALID_INPUT",
    });
  });

  it("refuses a future glucose timestamp", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ glucoseTimestamp: "2026-07-24T04:05:00.000Z" }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "FUTURE_GLUCOSE_TIMESTAMP" });
  });

  it("refuses stale glucose beyond 15 minutes", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ glucoseTimestamp: "2026-07-24T03:44:00.000Z" }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "STALE_GLUCOSE" });
  });

  it("accepts glucose exactly at the 15-minute freshness boundary", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ glucoseTimestamp: "2026-07-24T03:45:00.000Z" }),
      context,
    );
    expect(result.allowed).toBe(true);
  });

  it("refuses when the device clock is unreliable relative to the trusted server clock", () => {
    const result = runSafetyGates(makeSettings(), makeRequest(), {
      ...context,
      serverNow: "2026-07-24T05:00:00.000Z",
    });
    expect(result).toMatchObject({ allowed: false, refusalCode: "UNRELIABLE_DEVICE_TIME" });
  });

  it("refuses invalid carbohydrate amount for meal mode zero", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ mode: "MEAL", carbohydrateGrams: "0" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "INVALID_INPUT" });
  });

  it("accepts zero carbohydrate for correction-only mode", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "0" }),
      context,
    );
    expect(result.allowed).toBe(true);
  });

  it("refuses nonzero carbohydrate for correction-only mode", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "1" }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "INVALID_INPUT" });
  });

  it("refuses negative carbohydrate", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ carbohydrateGrams: "-5" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "INVALID_INPUT" });
  });

  it("refuses duplicate-event risk", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ duplicateDose: true }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "DUPLICATE_EVENT_RISK" });
  });

  it("refuses incomplete recent history", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ recentHistoryComplete: false }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "RECENT_BOLUS_HISTORY_INCOMPLETE" });
  });

  it("refuses negative active insulin as invalid input", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ activeInsulinUnits: "-1" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "INVALID_INPUT" });
  });

  it("refuses positive active insulin without subtraction (hard lockout, C-01)", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ activeInsulinUnits: "2" }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "ACTIVE_PRIOR_BOLUS" });
  });

  it("accepts explicit zero active insulin", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ activeInsulinUnits: "0" }), context);
    expect(result.allowed).toBe(true);
  });

  it("refuses an invalid prior-dose record", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ priorRapidActingDoses: [{ units: "0", administeredAt: "2026-07-24T01:00:00.000Z" }] }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "INVALID_INPUT" });
  });

  it("refuses a future prior dose", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ priorRapidActingDoses: [{ units: "3", administeredAt: "2026-07-24T05:00:00.000Z" }] }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "FUTURE_PRIOR_BOLUS" });
  });

  it("refuses a prior dose within the insulin duration (active prior bolus)", () => {
    // 3 U at 2:59:59 elapsed with a 4 h duration - handoff test matrix.
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ priorRapidActingDoses: [{ units: "3", administeredAt: "2026-07-24T01:00:01.000Z" }] }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "ACTIVE_PRIOR_BOLUS" });
  });

  it("permits a prior dose exactly at the duration boundary (elapsed >= duration)", () => {
    // 3 U exactly 4 h earlier than calculatedAt (04:00) => 00:00, elapsed == duration.
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ priorRapidActingDoses: [{ units: "3", administeredAt: "2026-07-24T00:00:00.000Z" }] }),
      context,
    );
    expect(result.allowed).toBe(true);
  });

  it("refuses hypo symptoms", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ hypoSymptoms: true }), context);
    expect(result).toMatchObject({ allowed: false, refusalCode: "HYPO_SYMPTOMS" });
  });

  it("refuses unconsciousness/unable-to-swallow as an emergency escalation", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ specialSituations: ["UNCONSCIOUS_OR_UNABLE_TO_SWALLOW"] }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "HYPO_SYMPTOMS" });
  });

  it("refuses glucose at or below the low threshold", () => {
    expect(runSafetyGates(makeSettings(), makeRequest({ currentGlucose: "4" }), context)).toMatchObject({
      allowed: false,
      refusalCode: "HYPO_THRESHOLD",
    });
  });

  it("permits glucose immediately above the low threshold", () => {
    const result = runSafetyGates(makeSettings(), makeRequest({ currentGlucose: "4.000001" }), context);
    expect(result.allowed).toBe(true);
  });

  it.each([
    ["SEVERE_ILLNESS"],
    ["SICK_DAY"],
    ["VOMITING"],
    ["DEHYDRATION"],
    ["KETONES"],
    ["PAEDIATRIC_USE"],
    ["PREGNANCY"],
    ["CONCENTRATED_INSULIN_AMBIGUITY"],
    ["PUMP_OR_AID"],
    ["BASAL_OR_PREMIXED_INSULIN"],
    ["EXERCISE_ADJUSTMENT"],
    ["ALCOHOL_ADJUSTMENT"],
    ["STEROID_ADJUSTMENT"],
    ["OTHER_TREATMENT_PLAN"],
  ])("refuses special clinical situation %s", (situation) => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ specialSituations: [situation as never] }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "SPECIAL_CLINICAL_SITUATION" });
  });

  it("refuses paediatric use when the patient is not explicitly configured as adult", () => {
    const result = runSafetyGates(makeSettings(), makeRequest(), { ...context, patientIsAdult: false });
    expect(result).toMatchObject({ allowed: false, refusalCode: "SPECIAL_CLINICAL_SITUATION" });
  });

  it("refuses when concentrated-insulin use has not been explicitly confirmed", () => {
    const result = runSafetyGates(
      makeSettings(),
      makeRequest({ concentratedInsulinConfirmed: false }),
      context,
    );
    expect(result).toMatchObject({ allowed: false, refusalCode: "SPECIAL_CLINICAL_SITUATION" });
  });
});
