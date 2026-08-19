import { FoodModuleError } from "../food/errors.js";
import { round1dp } from "../food/shared.js";
import type { CustomFoodType } from "@diabetes-companion/food-contracts";

const MAX_NAME_LENGTH = 200;
const MAX_CARBOHYDRATE_PER_100G = 100;

export interface CustomFoodInput {
  readonly foodType: CustomFoodType;
  readonly name: string;
  readonly brand?: string | null;
  readonly servingDescription?: string | null;
  readonly servingGrams?: number | null;
  readonly carbohydratePerServingGrams?: number | null;
  readonly carbohydratePer100gGrams?: number | null;
  readonly sourceName?: string | null;
  readonly sourceReference?: string | null;
  readonly sourceRetrievedAt?: string | null;
}

export interface NormalizedCustomFoodInput {
  readonly foodType: CustomFoodType;
  readonly name: string;
  readonly brand: string | null;
  readonly servingDescription: string | null;
  readonly servingGrams: string | null;
  readonly carbohydratePerServingGrams: string | null;
  readonly carbohydratePer100gGrams: string;
  readonly sourceName: string | null;
  readonly sourceReference: string | null;
  readonly sourceRetrievedAt: string | null;
}

function requirePositiveFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new FoodModuleError("INVALID_CUSTOM_FOOD", `${field} must be a positive number.`);
  }
  return value;
}

function validateCarbPer100g(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_CARBOHYDRATE_PER_100G) {
    throw new FoodModuleError(
      "INVALID_CUSTOM_FOOD",
      `Carbohydrate per 100 g must be between 0 and ${MAX_CARBOHYDRATE_PER_100G}.`,
    );
  }
  return value;
}

/**
 * Validates and normalizes a user-created custom food (packet-label or
 * manual entry). Derives a per-100g carbohydrate figure - a portion-scaling
 * data-entry convenience identical in kind to the existing household-measure
 * gram conversion in apps/api/src/food/calculate.ts, not a clinical formula.
 * Both the derived figure and the patient's originally entered values are
 * stored, so provenance is never lost.
 */
export function validateCustomFoodInput(input: CustomFoodInput): NormalizedCustomFoodInput {
  if (input.foodType !== "PACKET_LABEL" && input.foodType !== "MANUAL" && input.foodType !== "ONLINE_CONFIRMED") {
    throw new FoodModuleError("INVALID_CUSTOM_FOOD", "foodType must be PACKET_LABEL, MANUAL, or ONLINE_CONFIRMED.");
  }
  const name = (input.name ?? "").trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new FoodModuleError("INVALID_CUSTOM_FOOD", `name must be 1-${MAX_NAME_LENGTH} characters.`);
  }
  const brand = input.brand?.trim() || null;
  const servingDescription = input.servingDescription?.trim() || null;
  const sourceName = input.sourceName?.trim() || null;
  const sourceReference = input.sourceReference?.trim() || null;
  const sourceRetrievedAt = input.sourceRetrievedAt?.trim() || null;
  if (input.foodType === "ONLINE_CONFIRMED" && (!sourceName || !sourceReference || !sourceRetrievedAt || Number.isNaN(Date.parse(sourceRetrievedAt)))) {
    throw new FoodModuleError("INVALID_CUSTOM_FOOD", "Online-confirmed food records require a source name, source reference, and valid retrieval time.");
  }

  const hasDirectPer100g = input.carbohydratePer100gGrams !== undefined && input.carbohydratePer100gGrams !== null;
  const hasServingBasis =
    input.servingGrams !== undefined &&
    input.servingGrams !== null &&
    input.carbohydratePerServingGrams !== undefined &&
    input.carbohydratePerServingGrams !== null;

  if (!hasDirectPer100g && !hasServingBasis) {
    throw new FoodModuleError(
      "INVALID_CUSTOM_FOOD",
      "Provide either carbohydratePer100gGrams, or both servingGrams and carbohydratePerServingGrams.",
    );
  }

  let servingGrams: number | null = null;
  let carbohydratePerServingGrams: number | null = null;
  if (hasServingBasis) {
    servingGrams = requirePositiveFinite(input.servingGrams, "servingGrams");
    // Zero grams of carbohydrate per serving is valid (e.g. plain water);
    // only the serving weight itself must be strictly positive.
    carbohydratePerServingGrams = input.carbohydratePerServingGrams as number;
    if (!Number.isFinite(carbohydratePerServingGrams) || carbohydratePerServingGrams < 0) {
      throw new FoodModuleError("INVALID_CUSTOM_FOOD", "carbohydratePerServingGrams must be a non-negative number.");
    }
  }

  const derivedPer100g = hasDirectPer100g
    ? (input.carbohydratePer100gGrams as number)
    : round1dp(((carbohydratePerServingGrams as number) / (servingGrams as number)) * 100);

  const carbohydratePer100gGrams = validateCarbPer100g(derivedPer100g);

  return {
    foodType: input.foodType,
    name,
    brand,
    servingDescription,
    servingGrams: servingGrams !== null ? String(servingGrams) : null,
    carbohydratePerServingGrams: carbohydratePerServingGrams !== null ? String(carbohydratePerServingGrams) : null,
    carbohydratePer100gGrams: String(carbohydratePer100gGrams),
    sourceName,
    sourceReference,
    sourceRetrievedAt,
  };
}
