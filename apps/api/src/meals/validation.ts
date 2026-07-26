import { FoodModuleError } from "../food/errors.js";
import type { MealComponentQuantityKind, MealComponentSource } from "@diabetes-companion/food-contracts";

const MAX_NAME_LENGTH = 200;
const MAX_LABEL_LENGTH = 200;
const MAX_QUANTITY = 5000;
const MAX_MEASURE_MULTIPLIER = 100;

export function validateMealName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new FoodModuleError("INVALID_MEAL_COMPONENT", `Meal name must be 1-${MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

export interface MealComponentInput {
  readonly componentSource: MealComponentSource;
  readonly sourceDataset?: string | null;
  readonly sourceFoodId?: string | null;
  readonly customFoodId?: string | null;
  readonly label: string;
  readonly quantityKind: MealComponentQuantityKind;
  readonly quantityGrams?: number | null;
  readonly quantityMillilitres?: number | null;
  readonly measureId?: string | null;
  readonly measureMultiplier?: number | null;
}

export interface NormalizedMealComponentInput {
  readonly componentSource: MealComponentSource;
  readonly sourceDataset: string | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  readonly label: string;
  readonly quantityKind: MealComponentQuantityKind;
  readonly quantityGrams: string | null;
  readonly quantityMillilitres: string | null;
  readonly measureId: string | null;
  readonly measureMultiplier: string | null;
}

function requirePositive(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new FoodModuleError("INVALID_MEAL_COMPONENT", `${field} must be a positive number up to ${max}.`);
  }
  return value;
}

/** Validates a meal component definition (add or edit). Does not check that
 * a referenced official food or custom food actually exists - callers must
 * do that separately, since it requires database/repository access. */
export function validateMealComponentInput(input: MealComponentInput): NormalizedMealComponentInput {
  const label = (input.label ?? "").trim();
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    throw new FoodModuleError("INVALID_MEAL_COMPONENT", `label must be 1-${MAX_LABEL_LENGTH} characters.`);
  }

  if (input.componentSource === "AUSNUT" || input.componentSource === "AFCD") {
    if (!input.sourceDataset || !input.sourceFoodId || input.customFoodId) {
      throw new FoodModuleError(
        "INVALID_MEAL_COMPONENT",
        "AUSNUT/AFCD components require sourceDataset and sourceFoodId, and must not set customFoodId.",
      );
    }
  } else if (input.componentSource === "CUSTOM") {
    if (!input.customFoodId || input.sourceDataset || input.sourceFoodId) {
      throw new FoodModuleError(
        "INVALID_MEAL_COMPONENT",
        "CUSTOM components require customFoodId, and must not set sourceDataset/sourceFoodId.",
      );
    }
  } else {
    throw new FoodModuleError("INVALID_MEAL_COMPONENT", "componentSource must be AUSNUT, AFCD, or CUSTOM.");
  }

  let quantityGrams: number | null = null;
  let quantityMillilitres: number | null = null;
  let measureId: string | null = null;
  let measureMultiplier: number | null = null;

  if (input.quantityKind === "GRAMS") {
    quantityGrams = requirePositive(input.quantityGrams, "quantityGrams", MAX_QUANTITY);
  } else if (input.quantityKind === "MILLILITRES") {
    if (input.componentSource !== "AFCD") {
      throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Millilitre quantities are only valid for AFCD components.");
    }
    quantityMillilitres = requirePositive(input.quantityMillilitres, "quantityMillilitres", MAX_QUANTITY);
  } else if (input.quantityKind === "MEASURE") {
    if (input.componentSource !== "AUSNUT") {
      throw new FoodModuleError("INVALID_MEAL_COMPONENT", "Measure quantities are only valid for AUSNUT components.");
    }
    if (!input.measureId) throw new FoodModuleError("INVALID_MEAL_COMPONENT", "measureId is required for MEASURE quantities.");
    measureId = input.measureId;
    measureMultiplier = requirePositive(input.measureMultiplier, "measureMultiplier", MAX_MEASURE_MULTIPLIER);
  } else {
    throw new FoodModuleError("INVALID_MEAL_COMPONENT", "quantityKind must be GRAMS, MILLILITRES, or MEASURE.");
  }

  return {
    componentSource: input.componentSource,
    sourceDataset: input.sourceDataset ?? null,
    sourceFoodId: input.sourceFoodId ?? null,
    customFoodId: input.customFoodId ?? null,
    label,
    quantityKind: input.quantityKind,
    quantityGrams: quantityGrams !== null ? String(quantityGrams) : null,
    quantityMillilitres: quantityMillilitres !== null ? String(quantityMillilitres) : null,
    measureId,
    measureMultiplier: measureMultiplier !== null ? String(measureMultiplier) : null,
  };
}
