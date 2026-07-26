import type { CustomFoodRecord } from "@diabetes-companion/food-contracts";
import { FoodModuleError } from "../food/errors.js";
import { requireFiniteQuantity, round1dp, MAX_GRAMS } from "../food/shared.js";

/**
 * Computes carbohydrate grams for a quantity of a user-created custom food.
 * Purely a linear scaling of the patient-entered per-100g figure - the same
 * kind of portion arithmetic as the official-database gram calculation in
 * apps/api/src/food/calculate.ts, not a clinical formula.
 *
 * Archiving a custom food only hides it from selection pickers (see
 * apps/api/src/customFoods/routes.ts); it does not block calculation, so
 * archiving a food never breaks an existing saved meal that already
 * references it as a component.
 */
export function calculateCustomFoodCarbohydrateGrams(food: CustomFoodRecord, grams: number): number {
  requireFiniteQuantity(grams, MAX_GRAMS);
  if (!food.carbohydratePer100gGrams) {
    throw new FoodModuleError("NO_CARBOHYDRATE_DATA", "This custom food has no carbohydrate data recorded.");
  }
  const per100g = Number(food.carbohydratePer100gGrams);
  return round1dp((per100g * grams) / 100);
}
