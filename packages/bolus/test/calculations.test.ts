import { describe, expect, it } from "vitest";
import { calculateMealBolus, calculateCorrectionBolus, calculateBolusPreview } from "../src/calculations.js";
import { parseNumericSettings } from "../src/settings.js";
import { Decimal } from "../src/decimal.js";
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

function parsedInputFor(currentGlucose: string, carbohydrateGrams: string) {
  return {
    currentGlucose: Decimal.parse(currentGlucose),
    carbohydrateGrams: Decimal.parse(carbohydrateGrams),
    calculatedAtMs: Date.parse("2026-07-24T04:00:00.000Z"),
    activeInsulinUnits: null,
  };
}

function makeDependencies() {
  const settingsRepository = new InMemorySettingsRepository();
  const auditStore = new InMemoryAuditStore();
  const calculationRepository = new InMemoryCalculationRepository();
  return {
    settingsRepository,
    auditStore,
    calculationRepository,
    clock: { now: () => "2026-07-24T04:00:00.000Z" },
    idGenerator: { newId: () => "calc_fixed" },
  };
}

describe("calculateMealBolus / calculateCorrectionBolus (pure formulas)", () => {
  const settings = parseNumericSettings(makeSettings());

  it("standard meal dose: G=6, C=40 => meal 4, correction 0, rounded 4", () => {
    const result = calculateMealBolus(settings, parsedInputFor("6", "40"));
    expect(result.mealComponentUnits).toBe("4");
    expect(result.correctionComponentUnits).toBe("0");
    expect(result.unroundedTotalUnits).toBe("4");
    expect(result.roundedTotalUnits).toBe("4");
    expect(result.status).toBe("CALCULATED");
  });

  it("correction only: G=11, C=0 => correction 2.5, rounded 2.5", () => {
    const result = calculateCorrectionBolus(settings, parsedInputFor("11", "0"));
    expect(result.mealComponentUnits).toBe("0");
    expect(result.correctionComponentUnits).toBe("2.5");
    expect(result.roundedTotalUnits).toBe("2.5");
  });

  it("meal plus correction: G=10, C=40 => meal 4, correction 2, total 6", () => {
    const result = calculateMealBolus(settings, parsedInputFor("10", "40"));
    expect(result.mealComponentUnits).toBe("4");
    expect(result.correctionComponentUnits).toBe("2");
    expect(result.unroundedTotalUnits).toBe("6");
    expect(result.roundedTotalUnits).toBe("6");
  });

  it("below-target meal: G=5, C=40 => correction -0.5, total 3.5", () => {
    const result = calculateMealBolus(settings, parsedInputFor("5", "40"));
    expect(result.correctionComponentUnits).toBe("-0.5");
    expect(result.unroundedTotalUnits).toBe("3.5");
    expect(result.roundedTotalUnits).toBe("3.5");
  });

  it("rounds 4.25 up to 4.5 at a 0.5 increment", () => {
    // C=42.5, G=6 => meal 4.25, correction 0, raw 4.25
    const result = calculateMealBolus(settings, parsedInputFor("6", "42.5"));
    expect(result.unroundedTotalUnits).toBe("4.25");
    expect(result.roundedTotalUnits).toBe("4.5");
  });

  it("rounds once after combining components, not per-component", () => {
    // C=43 (meal 4.3), G=6.4 (correction 0.2) => combined 4.5, rounded 4.5
    const result = calculateMealBolus(settings, parsedInputFor("6.4", "43"));
    expect(result.mealComponentUnits).toBe("4.3");
    expect(result.correctionComponentUnits).toBe("0.2");
    expect(result.unroundedTotalUnits).toBe("4.5");
    expect(result.roundedTotalUnits).toBe("4.5");
  });

  it("clamps a negative combined total to zero (CALCULATED_ZERO), never negative", () => {
    // Deep below-target correction outweighing a small meal component.
    const result = calculateMealBolus(settings, parsedInputFor("1", "1"));
    expect(result.status).toBe("CALCULATED_ZERO");
    expect(result.roundedTotalUnits).toBe("0");
  });

  it("supports mg/dL configured units with independent arithmetic", () => {
    const mgdlSettings = parseNumericSettings(
      makeSettings({ glucoseUnit: "MG_DL", targetGlucose: "108", lowGlucoseThreshold: "72", isf: "36" }),
    );
    const result = calculateMealBolus(mgdlSettings, parsedInputFor("180", "40"));
    // correction = (180-108)/36 = 2
    expect(result.correctionComponentUnits).toBe("2");
    expect(result.roundedTotalUnits).toBe("6");
  });
});

describe("calculateBolusPreview (full orchestration)", () => {
  it("produces a CALCULATED preview for the Weet-Bix acceptance scenario", async () => {
    const deps = makeDependencies();
    deps.settingsRepository.set(makeSettings());
    const result = await calculateBolusPreview(makeRequest(), context, deps);
    expect(result.status).toBe("CALCULATED");
    if (result.status !== "REFUSED") {
      expect(result.roundedTotalUnits).toBe("6");
      expect(result.activeInsulinAdjustmentUnits).toBe("0");
      expect(result.confirmationRequired).toBe(true);
      expect(result.snapshotHash).toBeTruthy();
    }
  });

  it("refuses when the raw dose exceeds the maximum (never caps)", async () => {
    const deps = makeDependencies();
    deps.settingsRepository.set(makeSettings());
    const result = await calculateBolusPreview(makeRequest({ carbohydrateGrams: "250" }), context, deps);
    expect(result).toMatchObject({ status: "REFUSED", refusalCode: "MAXIMUM_DOSE_EXCEEDED" });
    expect((result as any).roundedTotalUnits).toBeUndefined();
    expect((result as any).mealComponentUnits).toBeUndefined();
  });

  it("refuses when rounding pushes an in-range raw dose over the maximum", async () => {
    const deps = makeDependencies();
    deps.settingsRepository.set(
      makeSettings({ maximumDoseUnits: "3.5", doseIncrementUnits: "1", targetGlucose: "6", isf: "2" }),
    );
    const result = await calculateBolusPreview(
      makeRequest({ mode: "CORRECTION_ONLY", carbohydrateGrams: "0", currentGlucose: "13" }),
      context,
      deps,
    );
    expect(result).toMatchObject({ status: "REFUSED", refusalCode: "MAXIMUM_DOSE_EXCEEDED" });
  });

  it("refuses AUDIT_PERSISTENCE_FAILURE and displays no dose when audit logging fails", async () => {
    const deps = makeDependencies();
    deps.settingsRepository.set(makeSettings());
    deps.auditStore.failNextAppend();
    const result = await calculateBolusPreview(makeRequest(), context, deps);
    expect(result).toMatchObject({ status: "REFUSED", refusalCode: "AUDIT_PERSISTENCE_FAILURE" });
    expect((result as any).roundedTotalUnits).toBeUndefined();
  });

  it("is deterministic: identical input/settings repeated 100 times yields identical output", async () => {
    const results: BolusSuccess[] = [];
    for (let i = 0; i < 100; i += 1) {
      const deps = makeDependencies();
      deps.settingsRepository.set(makeSettings());
      const result = await calculateBolusPreview(makeRequest(), context, deps);
      results.push(result as BolusSuccess);
    }
    const first = JSON.stringify(results[0]);
    for (const result of results) {
      expect(JSON.stringify(result)).toBe(first);
    }
  });

  it("property sweep: rounded dose is always a nonnegative multiple of the increment and never above max", async () => {
    const settings = makeSettings();
    for (let glucose = 4.5; glucose <= 20; glucose += 1.5) {
      for (let carbs = 5; carbs <= 200; carbs += 17) {
        const deps = makeDependencies();
        deps.settingsRepository.set(settings);
        const result = await calculateBolusPreview(
          makeRequest({ currentGlucose: String(glucose), carbohydrateGrams: String(carbs) }),
          context,
          deps,
        );
        if (result.status === "REFUSED") {
          expect(result.refusalCode).toBe("MAXIMUM_DOSE_EXCEEDED");
          continue;
        }
        const rounded = Number(result.roundedTotalUnits);
        expect(rounded).toBeGreaterThanOrEqual(0);
        expect(rounded).toBeLessThanOrEqual(20);
        const incrementCount = rounded / 0.5;
        expect(Math.round(incrementCount)).toBeCloseTo(incrementCount, 6);
      }
    }
  });
});
