/**
 * Neutral food-module result contracts.
 *
 * These types are the ONLY boundary between food search/selection and the
 * bolus module. Per BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 14,
 * the bolus module must never receive food names, brands, search results,
 * database ranking, or AI reasoning - only a confirmed numeric carbohydrate
 * gram value crosses that boundary.
 */

export type SourceDataset = "AUSNUT_2023" | "AFCD_RELEASE_3" | "BRANDED_OFFICIAL";

export type CarbohydrateDefinition =
  | "available_carbohydrate_without_sugar_alcohols"
  | "available_carbohydrate_with_sugar_alcohols";

export interface FoodProvenance {
  /** Local Australian database or an explicitly selected publisher-owned menu source. */
  readonly database: "australian_foods.sqlite" | "official_menu";
  readonly sourceObject: string;
  /** Empty only for publisher-owned menu data, which is versioned by sourceObject instead. */
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

/**
 * User-created foods (feature/custom-foods-saved-meals). Distinct from the
 * read-only AUSNUT/AFCD database - see FOOD_ADAPTER.md and
 * supabase/migrations/0008_custom_foods.sql. `mealId` above refers to a
 * single eating-occasion identifier at the bolus boundary and is unrelated
 * to `SavedMealRecord` below (a reusable named recipe).
 */
export type CustomFoodType = "PACKET_LABEL" | "MANUAL" | "ONLINE_CONFIRMED";

export interface CustomFoodRecord {
  readonly id: string;
  readonly patientId: string;
  readonly foodType: CustomFoodType;
  readonly name: string;
  readonly brand: string | null;
  readonly servingDescription: string | null;
  readonly servingGrams: string | null;
  readonly carbohydratePerServingGrams: string | null;
  readonly carbohydratePer100gGrams: string | null;
  /** Publisher/database details for an externally found food, saved only after the user confirms it. */
  readonly sourceName?: string | null;
  readonly sourceReference?: string | null;
  readonly sourceRetrievedAt?: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A proposed online food lookup. This is never calculation-ready until the user explicitly confirms it. */
export interface OnlineFoodLookupCandidate {
  readonly provider: "OPEN_FOOD_FACTS";
  readonly productCode: string;
  readonly name: string;
  readonly brand: string | null;
  readonly servingDescription: string | null;
  readonly servingGrams: number | null;
  readonly carbohydratePerServingGrams: number | null;
  readonly carbohydratePer100gGrams: number;
  readonly sourceUrl: string;
  readonly sourceRetrievedAt: string;
  /** Open Food Facts is community-contributed; UI must surface this and require confirmation. */
  readonly sourceReliability: "COMMUNITY_CONTRIBUTED";
}

/** A single ingredient/food line within a saved meal recipe. */
export type MealComponentSource = "AUSNUT" | "AFCD" | "CUSTOM";
export type MealComponentQuantityKind = "GRAMS" | "MILLILITRES" | "MEASURE";

export interface SavedMealComponentRecord {
  readonly id: string;
  readonly mealId: string;
  readonly position: number;
  readonly componentSource: MealComponentSource;
  readonly sourceDataset: SourceDataset | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  readonly label: string;
  readonly quantityKind: MealComponentQuantityKind;
  readonly quantityGrams: string | null;
  readonly quantityMillilitres: string | null;
  readonly measureId: string | null;
  readonly measureMultiplier: string | null;
}

/** A saved, reusable, named recipe of multiple food components. */
export interface SavedMealRecord {
  readonly id: string;
  readonly patientId: string;
  readonly name: string;
  readonly duplicatedFromMealId: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly components: readonly SavedMealComponentRecord[];
}

/** Carbohydrate result for one meal component, computed at use-time. */
export interface MealComponentCarbohydrateResult {
  readonly componentId: string;
  readonly label: string;
  readonly portionDescription: string;
  readonly portionQuantity: number;
  readonly carbohydrateGrams: number;
  readonly carbohydrateDefinition: CarbohydrateDefinition;
}

/**
 * Total carbohydrate for a saved meal, computed fresh from current
 * component quantities and current food-composition data every time - never
 * a stored, potentially-stale snapshot.
 */
export interface MealCarbohydrateCalculationResult {
  readonly mealId: string;
  readonly mealName: string;
  readonly components: readonly MealComponentCarbohydrateResult[];
  readonly totalCarbohydrateGrams: number;
}

/** Per-instance quantity override when using a saved meal - not persisted
 * to the recipe unless the caller separately edits the component. */
export interface MealComponentQuantityOverride {
  readonly componentId: string;
  readonly quantityKind: MealComponentQuantityKind;
  readonly quantityGrams?: string;
  readonly quantityMillilitres?: string;
  readonly measureMultiplier?: string;
}
