import type Database from "better-sqlite3";
import type { SourceDataset } from "@diabetes-companion/food-contracts";
import {
  emptyPanel,
  kcalFromKj,
  scaleNutrients,
  type NutrientPanel,
} from "@diabetes-companion/food-engine";
import { FoodModuleError } from "./errors.js";
import { requireFiniteQuantity, round1dp, MAX_GRAMS, MAX_MILLILITRES, MAX_MEASURE_MULTIPLIER } from "./shared.js";

export type CalculateNutritionRequest =
  | { readonly kind: "GRAMS"; readonly sourceDataset: SourceDataset; readonly sourceFoodId: string; readonly grams: number }
  | { readonly kind: "MILLILITRES"; readonly sourceDataset: SourceDataset; readonly sourceFoodId: string; readonly millilitres: number }
  | {
      readonly kind: "MEASURE";
      readonly sourceDataset: SourceDataset;
      readonly sourceFoodId: string;
      readonly measureId: string;
      readonly measureMultiplier: number;
    };

export interface NutritionCalculationResult {
  readonly sourceDataset: SourceDataset;
  readonly sourceFoodId: string;
  readonly foodName: string;
  readonly brand: string | null;
  readonly portionDescription: string;
  readonly portionQuantity: number;
  readonly portionGrams: number | null;
  readonly portionMillilitres: number | null;
  readonly nutrients: NutrientPanel;
  readonly provenance: {
    readonly database: "australian_foods.sqlite";
    readonly sourceObject: string;
    readonly databaseSha256: string;
  };
}

interface MeasureRow {
  measure_description: string;
  quantity: number;
  gram_amount: number | null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function ausnutPanel(row: Record<string, unknown> | undefined): NutrientPanel {
  if (!row) return emptyPanel();
  const energyKj = asNumber(row.energy_with_dietary_fibre_kj);
  const carbohydrate =
    asNumber(row.available_carbohydrate_without_sugar_alcohols_g) ??
    asNumber(row.available_carbohydrate_with_sugar_alcohols_g);
  return {
    ...emptyPanel(),
    energyKj,
    energyKcal: kcalFromKj(energyKj),
    proteinG: asNumber(row.protein_g),
    carbohydrateG: carbohydrate,
    fatG: asNumber(row.total_fat_g),
    saturatedFatG: asNumber(row.total_saturated_fat_g),
    fibreG: asNumber(row.dietary_fibre_g),
    sugarG: asNumber(row.total_sugars_g),
    sodiumMg: asNumber(row.sodium_na_mg),
    potassiumMg: asNumber(row.potassium_k_mg),
    calciumMg: asNumber(row.calcium_ca_mg),
    ironMg: asNumber(row.iron_fe_mg),
    magnesiumMg: asNumber(row.magnesium_mg_mg),
    cholesterolMg: asNumber(row.cholesterol_mg),
    vitaminAUg: asNumber(row.vitamin_a_retinol_equivalents_ug),
    vitaminCMg: asNumber(row.vitamin_c_mg),
    vitaminDUg: asNumber(row.vitamin_d3_equivalents_ug),
    vitaminB12Ug: asNumber(row.cobalamin_b12_ug),
    folateUg: asNumber(row.dietary_folate_equivalents_ug),
  };
}

function afcdPanel(row: Record<string, unknown> | undefined): NutrientPanel {
  if (!row) return emptyPanel();
  const energyKj = asNumber(row.energy_with_dietary_fibre_equated_kj);
  const carbohydrate =
    asNumber(row.available_carbohydrate_without_sugar_alcohols_g) ??
    asNumber(row.available_carbohydrate_with_sugar_alcohols_g);
  return {
    ...emptyPanel(),
    energyKj,
    energyKcal: kcalFromKj(energyKj),
    proteinG: asNumber(row.protein_g),
    carbohydrateG: carbohydrate,
    fatG: asNumber(row.fat_total_g),
    saturatedFatG: asNumber(row.total_saturated_fatty_acids_equated_g),
    fibreG: asNumber(row.total_dietary_fibre_g),
    sugarG: asNumber(row.total_sugars_g),
    sodiumMg: asNumber(row.sodium_na_mg),
    potassiumMg: asNumber(row.potassium_k_mg),
    calciumMg: asNumber(row.calcium_ca_mg),
    ironMg: asNumber(row.iron_fe_mg),
    magnesiumMg: asNumber(row.magnesium_mg_mg),
    cholesterolMg: asNumber(row.cholesterol_mg),
    vitaminAUg: asNumber(row.vitamin_a_retinol_equivalents_ug),
    vitaminCMg: asNumber(row.vitamin_c_mg),
    vitaminDUg: asNumber(row.vitamin_d3_equivalents_ug),
    vitaminB12Ug: asNumber(row.cobalamin_b12_ug),
    folateUg: asNumber(row.dietary_folate_equivalents_ug),
  };
}

const AUSNUT_NUTRIENT_SQL = `SELECT food_name, energy_with_dietary_fibre_kj, protein_g, total_fat_g, total_saturated_fat_g,
        available_carbohydrate_without_sugar_alcohols_g, available_carbohydrate_with_sugar_alcohols_g,
        dietary_fibre_g, total_sugars_g, sodium_na_mg, potassium_k_mg, calcium_ca_mg, iron_fe_mg,
        magnesium_mg_mg, cholesterol_mg, vitamin_a_retinol_equivalents_ug, vitamin_c_mg,
        vitamin_d3_equivalents_ug, cobalamin_b12_ug, dietary_folate_equivalents_ug
     FROM raw_ausnut_food_nutrients_food_nutrient_profiles
     WHERE CAST(survey_id AS TEXT) = @sourceFoodId`;

const AFCD_SOLID_SQL = `SELECT food_name, energy_with_dietary_fibre_equated_kj, protein_g, fat_total_g,
        total_saturated_fatty_acids_equated_g, available_carbohydrate_without_sugar_alcohols_g,
        available_carbohydrate_with_sugar_alcohols_g, total_dietary_fibre_g, total_sugars_g,
        sodium_na_mg, potassium_k_mg, calcium_ca_mg, iron_fe_mg, magnesium_mg_mg, cholesterol_mg,
        vitamin_a_retinol_equivalents_ug, vitamin_c_mg, vitamin_d3_equivalents_ug, cobalamin_b12_ug,
        dietary_folate_equivalents_ug
     FROM raw_afcd_nutrient_profiles_all_solids_liquids_per_100_g
     WHERE CAST(public_food_key AS TEXT) = @sourceFoodId`;

const AFCD_LIQUID_SQL = `SELECT food_name, energy_with_dietary_fibre_equated_kj, protein_g, fat_total_g,
        total_saturated_fatty_acids_equated_g, available_carbohydrate_without_sugar_alcohols_g,
        available_carbohydrate_with_sugar_alcohols_g, total_dietary_fibre_g, total_sugars_g,
        sodium_na_mg, potassium_k_mg, calcium_ca_mg, iron_fe_mg, magnesium_mg_mg, cholesterol_mg,
        vitamin_a_retinol_equivalents_ug, vitamin_c_mg, vitamin_d3_equivalents_ug, cobalamin_b12_ug,
        dietary_folate_equivalents_ug
     FROM raw_afcd_nutrient_profiles_liquids_only_per_100_ml
     WHERE CAST(public_food_key AS TEXT) = @sourceFoodId`;

function loadAusnut(db: InstanceType<typeof Database>, sourceFoodId: string): { name: string; per100: NutrientPanel } {
  const nameRow = db.prepare(`SELECT food_name FROM app_ausnut_foods WHERE source_food_id = @sourceFoodId`).get({ sourceFoodId }) as
    | { food_name: string }
    | undefined;
  if (!nameRow) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested food item was not found.");
  const nutrientRow = db.prepare(AUSNUT_NUTRIENT_SQL).get({ sourceFoodId }) as Record<string, unknown> | undefined;
  return { name: nameRow.food_name, per100: ausnutPanel(nutrientRow) };
}

function loadAfcdSolid(db: InstanceType<typeof Database>, sourceFoodId: string): { name: string; per100: NutrientPanel } {
  const nameRow = db.prepare(`SELECT food_name FROM app_afcd_foods_per_100g WHERE source_food_id = @sourceFoodId`).get({ sourceFoodId }) as
    | { food_name: string }
    | undefined;
  if (!nameRow) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested food item was not found.");
  const nutrientRow = db.prepare(AFCD_SOLID_SQL).get({ sourceFoodId }) as Record<string, unknown> | undefined;
  return { name: nameRow.food_name, per100: afcdPanel(nutrientRow) };
}

function loadAfcdLiquid(db: InstanceType<typeof Database>, sourceFoodId: string): { name: string; per100: NutrientPanel } {
  const nameRow = db
    .prepare(`SELECT food_name FROM app_afcd_liquids_per_100ml WHERE source_food_id = @sourceFoodId`)
    .get({ sourceFoodId }) as { food_name: string } | undefined;
  if (!nameRow) throw new FoodModuleError("FOOD_NOT_FOUND", "The requested liquid food item was not found.");
  const nutrientRow = db.prepare(AFCD_LIQUID_SQL).get({ sourceFoodId }) as Record<string, unknown> | undefined;
  return { name: nameRow.food_name, per100: afcdPanel(nutrientRow) };
}

export function calculateNutrition(
  db: InstanceType<typeof Database>,
  request: CalculateNutritionRequest,
  databaseSha256: string,
): NutritionCalculationResult {
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
    const food = loadAusnut(db, request.sourceFoodId);
    return {
      sourceDataset: request.sourceDataset,
      sourceFoodId: request.sourceFoodId,
      foodName: food.name,
      brand: null,
      portionDescription: measure.measure_description,
      portionQuantity: request.measureMultiplier,
      portionGrams: round1dp(grams),
      portionMillilitres: null,
      nutrients: scaleNutrients(food.per100, grams),
      provenance: { database: "australian_foods.sqlite", sourceObject: "app_ausnut_measures", databaseSha256 },
    };
  }

  if (request.kind === "GRAMS") {
    requireFiniteQuantity(request.grams, MAX_GRAMS);
    const food = request.sourceDataset === "AUSNUT_2023" ? loadAusnut(db, request.sourceFoodId) : loadAfcdSolid(db, request.sourceFoodId);
    const sourceObject = request.sourceDataset === "AUSNUT_2023" ? "raw_ausnut_food_nutrients_food_nutrient_profiles" : "raw_afcd_nutrient_profiles_all_solids_liquids_per_100_g";
    return {
      sourceDataset: request.sourceDataset,
      sourceFoodId: request.sourceFoodId,
      foodName: food.name,
      brand: null,
      portionDescription: `${request.grams} g`,
      portionQuantity: request.grams,
      portionGrams: round1dp(request.grams),
      portionMillilitres: null,
      nutrients: scaleNutrients(food.per100, request.grams),
      provenance: { database: "australian_foods.sqlite", sourceObject, databaseSha256 },
    };
  }

  if (request.sourceDataset !== "AFCD_RELEASE_3") {
    throw new FoodModuleError(
      "INVALID_QUANTITY",
      "Millilitre-based nutrition calculation is only supported for AFCD liquid items in this database.",
    );
  }
  requireFiniteQuantity(request.millilitres, MAX_MILLILITRES);
  const food = loadAfcdLiquid(db, request.sourceFoodId);
  return {
    sourceDataset: request.sourceDataset,
    sourceFoodId: request.sourceFoodId,
    foodName: food.name,
    brand: null,
    portionDescription: `${request.millilitres} mL`,
    portionQuantity: request.millilitres,
    portionGrams: null,
    portionMillilitres: round1dp(request.millilitres),
    nutrients: scaleNutrients(food.per100, request.millilitres),
    provenance: {
      database: "australian_foods.sqlite",
      sourceObject: "raw_afcd_nutrient_profiles_liquids_only_per_100_ml",
      databaseSha256,
    },
  };
}
