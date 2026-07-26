import type Database from "better-sqlite3";
import type {
  CarbohydrateCalculationResult,
  CarbohydrateDefinition,
  SourceDataset,
} from "@diabetes-companion/food-contracts";
import { FoodModuleError } from "./errors.js";

const MAX_GRAMS = 5000;
const MAX_MILLILITRES = 5000;
const MAX_MEASURE_MULTIPLIER = 100;

export type CalculateCarbohydrateRequest =
  | { readonly kind: "GRAMS"; readonly sourceDataset: SourceDataset; readonly sourceFoodId: string; readonly grams: number }
  | { readonly kind: "MILLILITRES"; readonly sourceDataset: SourceDataset; readonly sourceFoodId: string; readonly millilitres: number }
  | {
      readonly kind: "MEASURE";
      readonly sourceDataset: SourceDataset;
      readonly sourceFoodId: string;
      readonly measureId: string;
      readonly measureMultiplier: number;
    };

interface FoodRow {
  food_name: string;
  carbohydrate_without_sugar_alcohols_per_100g?: number | null;
  carbohydrate_with_sugar_alcohols_per_100g?: number | null;
  carbohydrate_without_sugar_alcohols_per_100ml?: number | null;
  carbohydrate_with_sugar_alcohols_per_100ml?: number | null;
}

interface MeasureRow {
  measure_description: string;
  quantity: number;
  gram_amount: number | null;
}

function requireFiniteQuantity(value: number, max: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FoodModuleError("INVALID_QUANTITY", "Quantity must be a finite number.");
  }
  if (value <= 0) throw new FoodModuleError("INVALID_QUANTITY", "Quantity must be greater than zero.");
  if (value > max) throw new FoodModuleError("QUANTITY_TOO_LARGE", `Quantity must not exceed ${max}.`);
}

function round1dp(value: number): number {
  return Math.round(value * 10) / 10;
}

function pickCarbohydrate(
  withoutSugarAlcohols: number | null | undefined,
  withSugarAlcohols: number | null | undefined,
): { grams100: number; definition: CarbohydrateDefinition } {
  if (withoutSugarAlcohols !== null && withoutSugarAlcohols !== undefined) {
    return { grams100: withoutSugarAlcohols, definition: "available_carbohydrate_without_sugar_alcohols" };
  }
  if (withSugarAlcohols !== null && withSugarAlcohols !== undefined) {
    return { grams100: withSugarAlcohols, definition: "available_carbohydrate_with_sugar_alcohols" };
  }
  throw new FoodModuleError("NO_CARBOHYDRATE_DATA", "No carbohydrate value is available for this food item.");
}

export function calculateCarbohydrate(
  db: InstanceType<typeof Database>,
  request: CalculateCarbohydrateRequest,
  databaseSha256: string,
): CarbohydrateCalculationResult {
  if (request.kind === "MEASURE") {
    if (request.sourceDataset !== "AUSNUT_2023") {
      throw new FoodModuleError("INVALID_QUANTITY", "Household measures are only available for AUSNUT_2023 items.");
    }
    requireFiniteQuantity(request.measureMultiplier, MAX_MEASURE_MULTIPLIER);
    const measure = db
      .prepare(
        `SELECT measure_description, quantity, gram_amount
         FROM app_ausnut_measures
         WHERE source_food_id = @sourceFoodId AND measure_id = @measureId`,
      )
      .get({ sourceFoodId: request.sourceFoodId, measureId: request.measureId }) as MeasureRow | undefined;
    if (!measure || measure.gram_amount === null) {
      throw new FoodModuleError("MEASURE_NOT_FOUND", "The requested household measure was not found.");
    }
    const grams = measure.gram_amount * request.measureMultiplier;
    requireFiniteQuantity(grams, MAX_GRAMS);
    const food = db
      .prepare(
        `SELECT food_name, carbohydrate_without_sugar_alcohols_per_100g, carbohydrate_with_sugar_alcohols_per_100g
         FROM app_ausnut_foods WHERE source_food_id = @sourceFoodId`,
      )
      .get({ sourceFoodId: request.sourceFoodId }) as FoodRow | undefined;
    if (!food) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested food item was not found.");
    const { grams100, definition } = pickCarbohydrate(
      food.carbohydrate_without_sugar_alcohols_per_100g,
      food.carbohydrate_with_sugar_alcohols_per_100g,
    );
    return {
      sourceDataset: request.sourceDataset,
      sourceFoodId: request.sourceFoodId,
      foodName: food.food_name,
      brand: null,
      portionDescription: measure.measure_description,
      portionQuantity: request.measureMultiplier,
      portionGrams: round1dp(grams),
      portionMillilitres: null,
      carbohydrateGrams: round1dp((grams100 * grams) / 100),
      carbohydrateDefinition: definition,
      provenance: {
        database: "australian_foods.sqlite",
        sourceObject: "app_ausnut_measures",
        databaseSha256,
      },
    };
  }

  if (request.kind === "GRAMS") {
    requireFiniteQuantity(request.grams, MAX_GRAMS);
    const table = request.sourceDataset === "AUSNUT_2023" ? "app_ausnut_foods" : "app_afcd_foods_per_100g";
    const food = db
      .prepare(
        `SELECT food_name, carbohydrate_without_sugar_alcohols_per_100g, carbohydrate_with_sugar_alcohols_per_100g
         FROM ${table} WHERE source_food_id = @sourceFoodId`,
      )
      .get({ sourceFoodId: request.sourceFoodId }) as FoodRow | undefined;
    if (!food) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested food item was not found.");
    const { grams100, definition } = pickCarbohydrate(
      food.carbohydrate_without_sugar_alcohols_per_100g,
      food.carbohydrate_with_sugar_alcohols_per_100g,
    );
    return {
      sourceDataset: request.sourceDataset,
      sourceFoodId: request.sourceFoodId,
      foodName: food.food_name,
      brand: null,
      portionDescription: `${request.grams} g`,
      portionQuantity: request.grams,
      portionGrams: round1dp(request.grams),
      portionMillilitres: null,
      carbohydrateGrams: round1dp((grams100 * request.grams) / 100),
      carbohydrateDefinition: definition,
      provenance: {
        database: "australian_foods.sqlite",
        sourceObject: table,
        databaseSha256,
      },
    };
  }

  // MILLILITRES
  if (request.sourceDataset !== "AFCD_RELEASE_3") {
    throw new FoodModuleError(
      "INVALID_QUANTITY",
      "Millilitre-based entry is only supported for AFCD liquid items in this database.",
    );
  }
  requireFiniteQuantity(request.millilitres, MAX_MILLILITRES);
  const food = db
    .prepare(
      `SELECT food_name, carbohydrate_without_sugar_alcohols_per_100ml AS carbohydrate_without_sugar_alcohols_per_100g,
              carbohydrate_with_sugar_alcohols_per_100ml AS carbohydrate_with_sugar_alcohols_per_100g
       FROM app_afcd_liquids_per_100ml WHERE source_food_id = @sourceFoodId`,
    )
    .get({ sourceFoodId: request.sourceFoodId }) as FoodRow | undefined;
  if (!food) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested liquid food item was not found.");
  const { grams100, definition } = pickCarbohydrate(
    food.carbohydrate_without_sugar_alcohols_per_100g,
    food.carbohydrate_with_sugar_alcohols_per_100g,
  );
  return {
    sourceDataset: request.sourceDataset,
    sourceFoodId: request.sourceFoodId,
    foodName: food.food_name,
    brand: null,
    portionDescription: `${request.millilitres} mL`,
    portionQuantity: request.millilitres,
    portionGrams: null,
    portionMillilitres: round1dp(request.millilitres),
    carbohydrateGrams: round1dp((grams100 * request.millilitres) / 100),
    carbohydrateDefinition: definition,
    provenance: {
      database: "australian_foods.sqlite",
      sourceObject: "app_afcd_liquids_per_100ml",
      databaseSha256,
    },
  };
}
