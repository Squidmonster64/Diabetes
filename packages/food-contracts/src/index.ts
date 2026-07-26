/**
 * Neutral food-module result contracts.
 *
 * These types are the ONLY boundary between food search/selection and the
 * bolus module. Per BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 14,
 * the bolus module must never receive food names, brands, search results,
 * database ranking, or AI reasoning - only a confirmed numeric carbohydrate
 * gram value crosses that boundary.
 */

export type SourceDataset = "AUSNUT_2023" | "AFCD_RELEASE_3";

export type CarbohydrateDefinition =
  | "available_carbohydrate_without_sugar_alcohols"
  | "available_carbohydrate_with_sugar_alcohols";

export interface FoodProvenance {
  readonly database: "australian_foods.sqlite";
  readonly sourceObject: string;
  readonly databaseSha256: string;
}

export interface FoodSearchResult {
  readonly sourceDataset: SourceDataset;
  readonly sourceFoodId: string;
  readonly publicFoodKey: string;
  readonly foodName: string;
  readonly foodDescription: string | null;
  readonly classification: string | null;
  readonly matchType: "EXACT" | "PREFIX" | "WHOLE_WORD" | "TOKEN" | "SUBSTRING";
  readonly rank: number;
  readonly hasGramData: boolean;
  readonly hasMillilitreData: boolean;
}

export interface FoodMeasure {
  readonly measureId: string;
  readonly measureDescription: string;
  readonly quantity: number;
  readonly gramAmount: number | null;
  readonly volumeMillilitres: number | null;
}

export interface FoodDetail {
  readonly sourceDataset: SourceDataset;
  readonly sourceFoodId: string;
  readonly publicFoodKey: string;
  readonly foodName: string;
  readonly foodDescription: string | null;
  readonly classification: string | null;
  readonly carbohydrateBasis: string;
  readonly hasGramData: boolean;
  readonly hasMillilitreData: boolean;
  readonly provenanceTable: string;
}

/** The neutral food result contract per APP_BUILD_PROMPT.md section 6. */
export interface CarbohydrateCalculationResult {
  readonly sourceDataset: SourceDataset;
  readonly sourceFoodId: string;
  readonly foodName: string;
  readonly brand: string | null;
  readonly portionDescription: string;
  readonly portionQuantity: number;
  readonly portionGrams: number | null;
  readonly portionMillilitres: number | null;
  readonly carbohydrateGrams: number;
  readonly carbohydrateDefinition: CarbohydrateDefinition;
  readonly provenance: FoodProvenance;
}

/** Untrusted candidate produced by the food module before user confirmation. */
export interface FoodModuleCandidate {
  readonly mealId: string;
  readonly candidateCarbohydrateGrams: string;
  readonly provenance: readonly {
    readonly source: "DATABASE" | "USER_ENTERED" | "AI_ESTIMATE";
    readonly sourceReference?: string;
  }[];
}

/** The only shape that may cross into the bolus module. */
export interface ConfirmedCarbohydrateInput {
  readonly mealId: string;
  readonly confirmedCarbohydrateGrams: string;
  readonly confirmedByUser: true;
  readonly confirmedAt: string;
}
