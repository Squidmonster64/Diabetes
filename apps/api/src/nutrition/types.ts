import { randomUUID } from "node:crypto";
import type {
  DayStatus,
  NutrientPanel,
  NutritionMealLog,
  NutritionTargets,
} from "@diabetes-companion/food-engine";

export interface NutritionCustomFood {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly brand: string | null;
  readonly servingDescription: string | null;
  readonly servingGrams: number | null;
  readonly nutrientsPer100g: NutrientPanel;
  readonly sourceNote: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NutritionSavedMeal {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly items: NutritionMealLog["items"];
  readonly totals: NutrientPanel;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NutritionRecipe {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly servings: number;
  readonly totalWeightGrams: number | null;
  readonly items: NutritionMealLog["items"];
  readonly nutrientsPerServing: NutrientPanel;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NutritionFavourite {
  readonly id: string;
  readonly userId: string;
  readonly foodKey: string;
  readonly foodName: string;
  readonly brand: string | null;
  readonly sourceDataset: string | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  readonly createdAt: string;
}

export interface NutritionProfile {
  readonly userId: string;
  readonly timezone: string;
  readonly units: "metric";
  readonly onboardingComplete: boolean;
  readonly targetsSkipped: boolean;
  readonly updatedAt: string;
}

export interface NutritionEvent {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface NutritionRepository {
  createMeal(log: NutritionMealLog): Promise<NutritionMealLog>;
  getMeal(userId: string, id: string): Promise<NutritionMealLog | undefined>;
  listMeals(userId: string, from?: string, to?: string): Promise<readonly NutritionMealLog[]>;
  updateMeal(userId: string, id: string, patch: Partial<NutritionMealLog>): Promise<NutritionMealLog>;
  deleteMeal(userId: string, id: string): Promise<void>;
  recentIdentical(userId: string, originalText: string, sinceIso: string): Promise<NutritionMealLog | undefined>;

  getTargets(userId: string): Promise<NutritionTargets | null>;
  putTargets(userId: string, targets: NutritionTargets | null): Promise<NutritionTargets | null>;

  getDayStatus(userId: string, localDate: string): Promise<DayStatus | undefined>;
  listDayStatus(userId: string, from: string, to: string): Promise<readonly DayStatus[]>;
  putDayStatus(userId: string, status: DayStatus): Promise<DayStatus>;

  getProfile(userId: string): Promise<NutritionProfile | undefined>;
  putProfile(profile: NutritionProfile): Promise<NutritionProfile>;

  listCustomFoods(userId: string): Promise<readonly NutritionCustomFood[]>;
  getCustomFood(userId: string, id: string): Promise<NutritionCustomFood | undefined>;
  createCustomFood(food: NutritionCustomFood): Promise<NutritionCustomFood>;
  updateCustomFood(userId: string, id: string, patch: Partial<NutritionCustomFood>): Promise<NutritionCustomFood>;

  listSavedMeals(userId: string): Promise<readonly NutritionSavedMeal[]>;
  getSavedMeal(userId: string, id: string): Promise<NutritionSavedMeal | undefined>;
  createSavedMeal(meal: NutritionSavedMeal): Promise<NutritionSavedMeal>;
  updateSavedMeal(userId: string, id: string, patch: Partial<NutritionSavedMeal>): Promise<NutritionSavedMeal>;
  deleteSavedMeal(userId: string, id: string): Promise<void>;

  listRecipes(userId: string): Promise<readonly NutritionRecipe[]>;
  getRecipe(userId: string, id: string): Promise<NutritionRecipe | undefined>;
  createRecipe(recipe: NutritionRecipe): Promise<NutritionRecipe>;
  updateRecipe(userId: string, id: string, patch: Partial<NutritionRecipe>): Promise<NutritionRecipe>;

  listFavourites(userId: string): Promise<readonly NutritionFavourite[]>;
  addFavourite(favourite: NutritionFavourite): Promise<NutritionFavourite>;
  removeFavourite(userId: string, id: string): Promise<void>;

  recordEvent(event: NutritionEvent): Promise<void>;
  deleteAllUserData(userId: string): Promise<void>;
}

export function newId(): string {
  return randomUUID();
}
