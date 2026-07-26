import type Database from "better-sqlite3";
import type {
  MealCarbohydrateCalculationResult,
  MealComponentCarbohydrateResult,
  MealComponentQuantityOverride,
  SavedMealComponentRecord,
  SavedMealRecord,
  SourceDataset,
} from "@diabetes-companion/food-contracts";
import { calculateCarbohydrate } from "../food/calculate.js";
import { FoodModuleError } from "../food/errors.js";
import { round1dp } from "../food/shared.js";
import type { CustomFoodsRepository } from "../customFoods/repository.js";
import { calculateCustomFoodCarbohydrateGrams } from "../customFoods/calculate.js";

function resolveQuantity(
  component: SavedMealComponentRecord,
  override: MealComponentQuantityOverride | undefined,
): { readonly kind: SavedMealComponentRecord["quantityKind"]; readonly grams?: number; readonly millilitres?: number; readonly measureMultiplier?: number } {
  if (!override) {
    return {
      kind: component.quantityKind,
      grams: component.quantityGrams ? Number(component.quantityGrams) : undefined,
      millilitres: component.quantityMillilitres ? Number(component.quantityMillilitres) : undefined,
      measureMultiplier: component.measureMultiplier ? Number(component.measureMultiplier) : undefined,
    };
  }
  return {
    kind: override.quantityKind,
    grams: override.quantityGrams ? Number(override.quantityGrams) : undefined,
    millilitres: override.quantityMillilitres ? Number(override.quantityMillilitres) : undefined,
    measureMultiplier: override.measureMultiplier ? Number(override.measureMultiplier) : undefined,
  };
}

/**
 * Computes the total carbohydrate for a saved meal "right now": fresh from
 * current component quantities (optionally overridden for this one
 * instance, without persisting the override) and current food-composition
 * data. Never a stored, potentially-stale snapshot - see FOOD_ADAPTER.md.
 * This is portion arithmetic only; the result crosses into the bolus module
 * only as a single confirmed numeric carbohydrateGrams total, exactly like
 * a single-food calculation.
 */
export async function calculateMealCarbohydrate(
  meal: SavedMealRecord,
  db: InstanceType<typeof Database>,
  databaseSha256: string,
  customFoodsRepository: CustomFoodsRepository,
  overrides: readonly MealComponentQuantityOverride[] = [],
): Promise<MealCarbohydrateCalculationResult> {
  const overrideByComponentId = new Map(overrides.map((override) => [override.componentId, override]));
  const componentResults: MealComponentCarbohydrateResult[] = [];

  for (const component of meal.components) {
    const quantity = resolveQuantity(component, overrideByComponentId.get(component.id));

    if (component.componentSource === "CUSTOM") {
      if (!component.customFoodId) {
        throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Custom meal component is missing a customFoodId.");
      }
      const food = await customFoodsRepository.getById(component.customFoodId);
      if (!food) throw new FoodModuleError("CUSTOM_FOOD_NOT_FOUND", "A custom food in this meal no longer exists.");
      const grams = quantity.grams;
      if (grams === undefined) {
        throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Custom food components require a gram quantity.");
      }
      const carbohydrateGrams = calculateCustomFoodCarbohydrateGrams(food, grams);
      componentResults.push({
        componentId: component.id,
        label: component.label,
        portionDescription: `${grams} g`,
        portionQuantity: grams,
        carbohydrateGrams,
        carbohydrateDefinition: "available_carbohydrate_without_sugar_alcohols",
      });
      continue;
    }

    if (!component.sourceDataset || !component.sourceFoodId) {
      throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Official-food meal component is missing food identifiers.");
    }
    const sourceDataset = component.sourceDataset as SourceDataset;

    if (quantity.kind === "MEASURE") {
      if (!component.measureId || quantity.measureMultiplier === undefined) {
        throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Measure quantity requires a measureId and multiplier.");
      }
      const result = calculateCarbohydrate(
        db,
        {
          kind: "MEASURE",
          sourceDataset,
          sourceFoodId: component.sourceFoodId,
          measureId: component.measureId,
          measureMultiplier: quantity.measureMultiplier,
        },
        databaseSha256,
      );
      componentResults.push(toComponentResult(component, result));
      continue;
    }

    if (quantity.kind === "MILLILITRES") {
      if (quantity.millilitres === undefined) {
        throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Millilitre quantity is missing a value.");
      }
      const result = calculateCarbohydrate(
        db,
        { kind: "MILLILITRES", sourceDataset, sourceFoodId: component.sourceFoodId, millilitres: quantity.millilitres },
        databaseSha256,
      );
      componentResults.push(toComponentResult(component, result));
      continue;
    }

    if (quantity.grams === undefined) {
      throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Gram quantity is missing a value.");
    }
    const result = calculateCarbohydrate(
      db,
      { kind: "GRAMS", sourceDataset, sourceFoodId: component.sourceFoodId, grams: quantity.grams },
      databaseSha256,
    );
    componentResults.push(toComponentResult(component, result));
  }

  const totalCarbohydrateGrams = round1dp(
    componentResults.reduce((sum, component) => sum + component.carbohydrateGrams, 0),
  );

  return {
    mealId: meal.id,
    mealName: meal.name,
    components: componentResults,
    totalCarbohydrateGrams,
  };
}

function toComponentResult(
  component: SavedMealComponentRecord,
  result: ReturnType<typeof calculateCarbohydrate>,
): MealComponentCarbohydrateResult {
  return {
    componentId: component.id,
    label: component.label,
    portionDescription: result.portionDescription,
    portionQuantity: result.portionQuantity,
    carbohydrateGrams: result.carbohydrateGrams,
    carbohydrateDefinition: result.carbohydrateDefinition,
  };
}
