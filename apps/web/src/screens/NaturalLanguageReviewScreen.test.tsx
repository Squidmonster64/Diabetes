import { describe, expect, it } from "vitest";
import type { ResolvedFoodComponent } from "../lib/foodMatch.js";
import { requiresOnlineFoodLookup } from "./NaturalLanguageReviewScreen.js";

function unresolvedComponent(overrides: Partial<ResolvedFoodComponent> = {}): ResolvedFoodComponent {
  return {
    component: {
      phrase: "zzzznonexistentfoodqqq",
      rawSpan: "zzzznonexistentfoodqqq",
      quantity: { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true },
      unit: { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true },
      quantityKind: "COUNT",
      selectedServingMeasureId: null,
      qualifier: null,
      matchStatus: "missing",
      quantityNeededForCalculation: true,
    },
    // The resolver’s status is deliberately not the condition under test.
    // The production defect occurred when a parser-side missing quantity and
    // a resolver-side no-match were treated as a manual-portion question.
    matchStatus: "ambiguous",
    bestMatch: null,
    alternates: [],
    carbohydrateGrams: null,
    servingMeasures: [],
    requiresManualPortion: true,
    ...overrides,
  };
}

describe("requiresOnlineFoodLookup", () => {
  it("uses the online review path when no local candidate or carbohydrate value exists", () => {
    expect(requiresOnlineFoodLookup(unresolvedComponent())).toBe(true);
  });

  it("does not send negligible items, locally matched items, or resolved carbohydrate values online", () => {
    expect(requiresOnlineFoodLookup(unresolvedComponent({ component: { ...unresolvedComponent().component, quantityNeededForCalculation: false } }))).toBe(false);
    expect(requiresOnlineFoodLookup(unresolvedComponent({ bestMatch: {
      source: "AUSNUT",
      label: "A local food",
      description: null,
      brand: null,
      confidence: 0.95,
      matchReason: "exact local match",
      sourceDataset: "AUSNUT_2023",
      sourceFoodId: "local-1",
      customFoodId: null,
    } }))).toBe(false);
    expect(requiresOnlineFoodLookup(unresolvedComponent({ carbohydrateGrams: 12.3 }))).toBe(false);
  });
});
