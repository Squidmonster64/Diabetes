import { describe, expect, it } from "vitest";
import {
  emptyPanel,
  formatNutrient,
  scaleNutrients,
  sumNutrients,
  type NutrientPanel,
} from "../src/nutrients.js";
import {
  coverageFromDays,
  dailyTotalsFromMeals,
  nutrientContributions,
  periodAverages,
  remainingCopy,
  remainingTowardTarget,
  targetAdherence,
  type DailyTotals,
} from "../src/aggregations.js";
import { inferMealType, localDateFromInstant } from "../src/time.js";
import { assumedPortionFromMeasure, isStrongIdentityMatch, pickCountableMeasure } from "../src/match.js";
import type { NutritionMealLog, NutritionTargets } from "../src/types.js";
import { buildDailyInsight } from "../src/insights.js";

function panel(partial: Partial<NutrientPanel>): NutrientPanel {
  return { ...emptyPanel(), ...partial, extra: partial.extra ?? {} };
}

function meal(id: string, localDate: string, totals: NutrientPanel, items: NutritionMealLog["items"] = []): NutritionMealLog {
  return {
    id,
    userId: "user",
    loggedAt: `${localDate}T12:00:00.000Z`,
    timezone: "Australia/Sydney",
    localDate,
    mealType: "lunch",
    originalText: "test",
    transcription: null,
    parseVersion: "meal-ast-v1",
    promptVersion: null,
    modelVersion: null,
    items,
    totals,
    confidence: 1,
    source: "text",
    warnings: [],
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

function item(name: string, nutrients: NutrientPanel): NutritionMealLog["items"][number] {
  return {
    id: name,
    originalFragment: name,
    identity: {
      foodId: name,
      foodName: name,
      brand: null,
      sourceDataset: "AUSNUT_2023",
      sourceFoodId: name,
      customFoodId: null,
      savedMealId: null,
      recipeId: null,
      source: "AUSNUT",
    },
    serving: { servingId: null, servingLabel: null, quantity: 1, unit: "g", grams: 100, millilitres: null },
    nutrients,
    assumptions: [],
    matchConfidence: 0.9,
    matchStatus: "resolved",
    databaseSha256: "abc",
    sourceVersion: "v1",
  };
}

describe("nutrient arithmetic", () => {
  it("scales per-100g values linearly", () => {
    const per100 = panel({ proteinG: 10, sodiumMg: 200, fibreG: 0, energyKcal: null });
    const scaled = scaleNutrients(per100, 50);
    expect(scaled.proteinG).toBe(5);
    expect(scaled.sodiumMg).toBe(100);
    expect(scaled.fibreG).toBe(0);
    expect(scaled.energyKcal).toBeNull();
  });

  it("distinguishes unknown from zero when summing", () => {
    const knownZero = panel({ fibreG: 0, proteinG: 10 });
    const unknown = panel({ fibreG: null, proteinG: null });
    const summed = sumNutrients([knownZero, unknown]);
    expect(summed.proteinG).toBe(10);
    expect(summed.fibreG).toBe(0);
    expect(summed.sodiumMg).toBeNull();
    expect(formatNutrient(summed.sodiumMg, "mg")).toBe("—");
    expect(formatNutrient(summed.fibreG, "g")).toBe("0 g");
  });

  it("sums three meals into a day total without inventing values", () => {
    const meals = [
      meal("a", "2026-08-24", panel({ proteinG: 20, carbohydrateG: 30, fatG: 10, sodiumMg: 400 })),
      meal("b", "2026-08-24", panel({ proteinG: 15, carbohydrateG: 40, fatG: 12, sodiumMg: 500 })),
      meal("c", "2026-08-24", panel({ proteinG: 25, carbohydrateG: 20, fatG: 8, sodiumMg: 300 })),
    ];
    const days = dailyTotalsFromMeals(meals, [], "2026-08-24", "2026-08-24");
    expect(days).toHaveLength(1);
    expect(days[0]!.totals.proteinG).toBe(60);
    expect(days[0]!.totals.carbohydrateG).toBe(90);
    expect(days[0]!.totals.fatG).toBe(30);
    expect(days[0]!.totals.sodiumMg).toBe(1200);
  });
});

describe("weekly aggregation and coverage", () => {
  it("averages seven complete days as sum / 7", () => {
    const meals = Array.from({ length: 7 }, (_, index) => {
      const date = `2026-08-1${index + 1}`;
      return meal(`m${index}`, date, panel({ proteinG: 10 * (index + 1), fibreG: 20 }));
    });
    const status = meals.map((row) => ({ localDate: row.localDate, completeness: "complete" as const }));
    const days = dailyTotalsFromMeals(meals, status, "2026-08-11", "2026-08-17");
    const averages = periodAverages(days);
    const expectedProtein = (10 + 20 + 30 + 40 + 50 + 60 + 70) / 7;
    expect(averages.onLoggedDays.proteinG).toBe(Math.round(expectedProtein * 10) / 10);
    expect(averages.onCompleteDays?.proteinG).toBe(averages.onLoggedDays.proteinG);
    expect(coverageFromDays(days).completeDays).toBe(7);
    expect(coverageFromDays(days).loggedDays).toBe(7);
  });

  it("does not treat a partial day as equivalent to a complete day", () => {
    const meals = Array.from({ length: 7 }, (_, index) => meal(`m${index}`, `2026-08-1${index + 1}`, panel({ proteinG: 70 })));
    const status = meals.map((row, index) => ({
      localDate: row.localDate,
      completeness: index === 0 ? ("partial" as const) : ("complete" as const),
    }));
    const days = dailyTotalsFromMeals(meals, status, "2026-08-11", "2026-08-17");
    const coverage = coverageFromDays(days);
    expect(coverage.loggedDays).toBe(7);
    expect(coverage.completeDays).toBe(6);
    expect(coverage.partialDays).toBe(1);
    expect(coverage.note).toContain("6 marked complete");
    const averages = periodAverages(days);
    expect(averages.onCompleteDays?.proteinG).toBe(70);
    expect(coverage.calendarDays).toBe(7);
  });

  it("does not treat unlogged days as zero intake", () => {
    const meals = [meal("only", "2026-08-24", panel({ proteinG: 90 }))];
    const days = dailyTotalsFromMeals(meals, [], "2026-08-18", "2026-08-24");
    const coverage = coverageFromDays(days);
    expect(coverage.loggedDays).toBe(1);
    expect(coverage.note.toLowerCase()).toContain("not treated as zero");
    expect(periodAverages(days).onLoggedDays.proteinG).toBe(90);
  });
});

describe("targets and wording", () => {
  it("treats sodium as a limit rather than leftover to consume", () => {
    const remaining = remainingTowardTarget(1850, { kind: "limit", value: 2000 });
    expect(remainingCopy("sodiumMg", remaining, { kind: "limit", value: 2000 })).toMatch(/limit/i);
    expect(remainingCopy("sodiumMg", remaining, { kind: "limit", value: 2000 })).not.toMatch(/remaining to eat/i);
    expect(remainingCopy("proteinG", remainingTowardTarget(112, { kind: "minimum", value: 150 }), { kind: "minimum", value: 150 })).toMatch(
      /minimum/,
    );
  });

  it("computes target adherence on complete days", () => {
    const days: DailyTotals[] = [
      { localDate: "2026-08-18", totals: panel({ proteinG: 160, sodiumMg: 1500, fibreG: 32 }), mealCount: 3, completeness: "complete", logged: true },
      { localDate: "2026-08-19", totals: panel({ proteinG: 80, sodiumMg: 2500, fibreG: 10 }), mealCount: 1, completeness: "complete", logged: true },
    ];
    const targets: NutritionTargets = {
      proteinG: { kind: "minimum", value: 150 },
      fibreG: { kind: "minimum", value: 30 },
      sodiumMg: { kind: "limit", value: 2000 },
    };
    const adherence = targetAdherence(days, targets);
    expect(adherence.find((row) => row.key === "proteinG")?.daysMet).toBe(1);
    expect(adherence.find((row) => row.key === "sodiumMg")?.daysMet).toBe(1);
    expect(adherence.find((row) => row.key === "fibreG")?.daysMet).toBe(1);
  });
});

describe("contribution analysis", () => {
  it("uses logged items, not guessed percentages", () => {
    const meals = [
      meal("m1", "2026-08-24", panel({ sodiumMg: 1000 }), [
        item("Bread", panel({ sodiumMg: 400 })),
        item("Ham", panel({ sodiumMg: 350 })),
        item("Cheese", panel({ sodiumMg: 250 })),
      ]),
    ];
    const rows = nutrientContributions(meals, "sodiumMg");
    expect(rows[0]?.label).toBe("Bread");
    expect(rows[0]?.percent).toBe(40);
    expect(rows.find((row) => row.label === "Ham")?.percent).toBe(35);
  });
});

describe("matching helpers", () => {
  it("treats Banana, cavendish as an identity match for banana", () => {
    expect(isStrongIdentityMatch("banana", "Banana, cavendish, peeled, raw")).toBe(true);
    expect(isStrongIdentityMatch("white bread", "Bread, white, commercial")).toBe(true);
  });

  it("picks a medium fruit measure and exposes the assumption", () => {
    const picked = pickCountableMeasure(
      [
        { measureId: "d", measureDescription: "1 density", quantity: 1, gramAmount: 0.9 },
        { measureId: "m", measureDescription: "1 banana medium", quantity: 1, gramAmount: 127.4 },
        { measureId: "s", measureDescription: "1 banana small", quantity: 1, gramAmount: 71.5 },
      ],
      "whole",
    );
    expect(picked?.measureId).toBe("m");
    expect(assumedPortionFromMeasure(picked!.measureDescription, "whole")).toBe("assumed medium");
  });
});

describe("meal type inference", () => {
  it("prefers stated meal names over clock hour", () => {
    expect(inferMealType(20, "Breakfast was two Weet-Bix")).toBe("breakfast");
    expect(inferMealType(8, "Lunch was a sandwich")).toBe("lunch");
  });

  it("formats local dates in the given timezone", () => {
    expect(localDateFromInstant("2026-08-24T14:00:00.000Z", "UTC")).toBe("2026-08-24");
  });
});

describe("daily insight", () => {
  it("does not invent targets when none are configured", () => {
    const insight = buildDailyInsight(panel({ proteinG: 117, fibreG: 21 }), null, []);
    expect(insight.statements[0]?.text).toContain("Today's intake");
    expect(insight.statements.some((row) => /limit/i.test(row.text))).toBe(false);
  });
});
