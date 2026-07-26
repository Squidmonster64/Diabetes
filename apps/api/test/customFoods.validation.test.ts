import { describe, expect, it } from "vitest";
import { validateCustomFoodInput } from "../src/customFoods/validation.js";
import { calculateCustomFoodCarbohydrateGrams } from "../src/customFoods/calculate.js";
import { FoodModuleError } from "../src/food/errors.js";

describe("validateCustomFoodInput", () => {
  it("accepts a packet-label food with a direct per-100g figure", () => {
    const result = validateCustomFoodInput({
      foodType: "PACKET_LABEL",
      name: "Brand X Muesli Bar",
      carbohydratePer100gGrams: 62,
    });
    expect(result.carbohydratePer100gGrams).toBe("62");
  });

  it("derives per-100g from serving-based packet-label entry", () => {
    // 30 g serving, 15 g carbohydrate per serving => 50 g per 100 g
    const result = validateCustomFoodInput({
      foodType: "PACKET_LABEL",
      name: "Brand Y Bar",
      servingGrams: 30,
      carbohydratePerServingGrams: 15,
    });
    expect(result.carbohydratePer100gGrams).toBe("50");
    expect(result.servingGrams).toBe("30");
    expect(result.carbohydratePerServingGrams).toBe("15");
  });

  it("accepts a manual entry with a direct per-100g figure", () => {
    const result = validateCustomFoodInput({
      foodType: "MANUAL",
      name: "Mum's soup",
      carbohydratePer100gGrams: 4.5,
    });
    expect(result.foodType).toBe("MANUAL");
    expect(result.carbohydratePer100gGrams).toBe("4.5");
  });

  it("allows zero carbohydrate per serving (e.g. plain water)", () => {
    const result = validateCustomFoodInput({
      foodType: "MANUAL",
      name: "Filtered water",
      servingGrams: 250,
      carbohydratePerServingGrams: 0,
    });
    expect(result.carbohydratePer100gGrams).toBe("0");
  });

  it("rejects a food with neither a direct nor a serving-derived carbohydrate figure", () => {
    expect(() => validateCustomFoodInput({ foodType: "MANUAL", name: "Mystery item" })).toThrow(FoodModuleError);
  });

  it("rejects a blank name", () => {
    expect(() =>
      validateCustomFoodInput({ foodType: "MANUAL", name: "   ", carbohydratePer100gGrams: 10 }),
    ).toThrow(FoodModuleError);
  });

  it("rejects a non-positive serving weight", () => {
    expect(() =>
      validateCustomFoodInput({
        foodType: "PACKET_LABEL",
        name: "Bad serving",
        servingGrams: 0,
        carbohydratePerServingGrams: 5,
      }),
    ).toThrow(FoodModuleError);
  });

  it("rejects a per-100g figure above the physical maximum", () => {
    expect(() =>
      validateCustomFoodInput({ foodType: "MANUAL", name: "Impossible food", carbohydratePer100gGrams: 150 }),
    ).toThrow(FoodModuleError);
  });

  it("rejects an unrecognised foodType", () => {
    expect(() =>
      validateCustomFoodInput({ foodType: "OTHER" as never, name: "X", carbohydratePer100gGrams: 10 }),
    ).toThrow(FoodModuleError);
  });
});

describe("calculateCustomFoodCarbohydrateGrams", () => {
  const baseFood = {
    id: "food_1",
    patientId: "patient_1",
    foodType: "MANUAL" as const,
    name: "Test food",
    brand: null,
    servingDescription: null,
    servingGrams: null,
    carbohydratePerServingGrams: null,
    carbohydratePer100gGrams: "20",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("scales carbohydrate linearly with grams", () => {
    expect(calculateCustomFoodCarbohydrateGrams(baseFood, 50)).toBe(10);
    expect(calculateCustomFoodCarbohydrateGrams(baseFood, 200)).toBe(40);
  });

  it("still calculates for an archived food (archiving only affects picker visibility)", () => {
    const archived = { ...baseFood, archivedAt: "2026-02-01T00:00:00.000Z" };
    expect(calculateCustomFoodCarbohydrateGrams(archived, 100)).toBe(20);
  });

  it("rejects zero or negative quantity", () => {
    expect(() => calculateCustomFoodCarbohydrateGrams(baseFood, 0)).toThrow(FoodModuleError);
    expect(() => calculateCustomFoodCarbohydrateGrams(baseFood, -10)).toThrow(FoodModuleError);
  });

  it("rejects an unreasonably large quantity", () => {
    expect(() => calculateCustomFoodCarbohydrateGrams(baseFood, 1_000_000)).toThrow(FoodModuleError);
  });

  it("throws NO_CARBOHYDRATE_DATA if the food has no recorded carbohydrate figure", () => {
    const noData = { ...baseFood, carbohydratePer100gGrams: null };
    expect(() => calculateCustomFoodCarbohydrateGrams(noData, 50)).toThrow(FoodModuleError);
  });
});
