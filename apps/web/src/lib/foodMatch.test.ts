import { describe, expect, it, vi } from "vitest";
import { resolveFoodComponent, type FoodMatchDependencies } from "./foodMatch.js";
import type { FoodComponentExtraction } from "@diabetes-companion/natural-language";

function component(overrides: Partial<FoodComponentExtraction> = {}): FoodComponentExtraction {
  return {
    phrase: "white bread",
    rawSpan: "two slices of white bread",
    quantity: { rawSpan: "two", value: 2, confidence: 0.85, status: "provisional", requiresConfirmation: true },
    unit: { rawSpan: "slices", value: "slices", confidence: 0.85, status: "provisional", requiresConfirmation: true },
    quantityKind: "COUNT",
    qualifier: null,
    matchStatus: "provisional",
    quantityNeededForCalculation: true,
    ...overrides,
  };
}

function baseDeps(overrides: Partial<FoodMatchDependencies> = {}): FoodMatchDependencies {
  return {
    searchFoods: vi.fn().mockResolvedValue({ results: [], totalMatches: 0 }),
    listCustomFoods: vi.fn().mockResolvedValue({ foods: [] }),
    getMeasures: vi.fn().mockResolvedValue({ measures: [] }),
    calculateCarbohydrate: vi.fn(),
    calculateCustomFoodCarbohydrate: vi.fn(),
    ...overrides,
  };
}

describe("resolveFoodComponent", () => {
  it("reports unmatched when nothing is found in any source", async () => {
    const result = await resolveFoodComponent(component(), baseDeps());
    expect(result.matchStatus).toBe("unmatched");
    expect(result.bestMatch).toBeNull();
    expect(result.carbohydrateGrams).toBeNull();
    expect(result.requiresManualPortion).toBe(true);
  });

  it("auto-calculates carbohydrate for a high-confidence AUSNUT match with a gram quantity", async () => {
    const deps = baseDeps({
      searchFoods: vi.fn().mockResolvedValue({
        results: [
          {
            sourceDataset: "AUSNUT_2023",
            sourceFoodId: "abc",
            publicFoodKey: "abc",
            foodName: "White bread",
            foodDescription: "White bread, commercial",
            classification: null,
            matchType: "EXACT",
            rank: 1,
            hasGramData: true,
            hasMillilitreData: false,
          },
        ],
        totalMatches: 1,
      }),
      calculateCarbohydrate: vi.fn().mockResolvedValue({ carbohydrateGrams: 24.5 }),
    });

    const result = await resolveFoodComponent(component({ quantityKind: "GRAMS", quantity: { rawSpan: "50g", value: 50, confidence: 0.85, status: "provisional", requiresConfirmation: true } }), deps);

    expect(result.matchStatus).toBe("resolved");
    expect(result.bestMatch?.source).toBe("AUSNUT");
    expect(result.carbohydrateGrams).toBe(24.5);
    expect(result.requiresManualPortion).toBe(false);
    expect(deps.calculateCarbohydrate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceDataset: "AUSNUT_2023", sourceFoodId: "abc", kind: "GRAMS", grams: 50 }),
    );
  });

  it("marks a low-confidence match as ambiguous and does not auto-calculate", async () => {
    const deps = baseDeps({
      searchFoods: vi.fn().mockResolvedValue({
        results: [
          {
            sourceDataset: "AUSNUT_2023",
            sourceFoodId: "xyz",
            publicFoodKey: "xyz",
            foodName: "Bread roll",
            foodDescription: "Bread roll, mixed grain",
            classification: null,
            matchType: "SUBSTRING",
            rank: 3,
            hasGramData: true,
            hasMillilitreData: false,
          },
        ],
        totalMatches: 1,
      }),
    });

    const result = await resolveFoodComponent(component(), deps);
    expect(result.matchStatus).toBe("ambiguous");
    expect(result.carbohydrateGrams).toBeNull();
    expect(deps.calculateCarbohydrate).not.toHaveBeenCalled();
  });

  it("contributes zero carbohydrate for a negligible-carb food with no stated quantity, without guessing a portion", async () => {
    const deps = baseDeps({
      searchFoods: vi.fn().mockResolvedValue({
        results: [
          {
            sourceDataset: "AUSNUT_2023",
            sourceFoodId: "ham1",
            publicFoodKey: "ham1",
            foodName: "Ham",
            foodDescription: "Ham, sliced",
            classification: null,
            matchType: "EXACT",
            rank: 1,
            hasGramData: true,
            hasMillilitreData: false,
          },
        ],
        totalMatches: 1,
      }),
    });

    const result = await resolveFoodComponent(
      component({
        phrase: "ham",
        quantity: { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true },
        quantityKind: "UNKNOWN",
        quantityNeededForCalculation: false,
      }),
      deps,
    );

    expect(result.matchStatus).toBe("resolved");
    expect(result.carbohydrateGrams).toBe(0);
    expect(result.requiresManualPortion).toBe(false);
    expect(deps.calculateCarbohydrate).not.toHaveBeenCalled();
  });

  it("prefers a custom food exact-name match over a lower-confidence database match", async () => {
    const deps = baseDeps({
      searchFoods: vi.fn().mockResolvedValue({
        results: [
          {
            sourceDataset: "AUSNUT_2023",
            sourceFoodId: "generic",
            publicFoodKey: "generic",
            foodName: "White bread",
            foodDescription: "White bread, generic",
            classification: null,
            matchType: "SUBSTRING",
            rank: 5,
            hasGramData: true,
            hasMillilitreData: false,
          },
        ],
        totalMatches: 1,
      }),
      listCustomFoods: vi.fn().mockResolvedValue({
        foods: [
          {
            id: "custom-1",
            patientId: "p1",
            foodType: "PACKET_LABEL",
            name: "white bread",
            brand: "Tip Top",
            servingDescription: "1 slice",
            servingGrams: "30",
            carbohydratePerServingGrams: "14",
            carbohydratePer100gGrams: "46.7",
            archivedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      calculateCustomFoodCarbohydrate: vi.fn().mockResolvedValue({ carbohydrateGrams: 28 }),
    });

    const result = await resolveFoodComponent(
      component({ quantityKind: "COUNT", quantity: { rawSpan: "two", value: 2, confidence: 0.85, status: "provisional", requiresConfirmation: true } }),
      deps,
    );

    expect(result.matchStatus).toBe("resolved");
    expect(result.bestMatch?.source).toBe("CUSTOM");
    expect(result.carbohydrateGrams).toBe(28);
    expect(deps.calculateCustomFoodCarbohydrate).toHaveBeenCalledWith("custom-1", 60);
  });
});
