import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayStatus, NutritionMealLog, NutritionTargets } from "@diabetes-companion/food-engine";
import type {
  NutritionCustomFood,
  NutritionEvent,
  NutritionFavourite,
  NutritionProfile,
  NutritionRecipe,
  NutritionRepository,
  NutritionSavedMeal,
} from "./types.js";

function rowToMeal(row: Record<string, unknown>): NutritionMealLog {
  return {
    id: row.id as string,
    userId: row.patient_id as string,
    loggedAt: row.logged_at as string,
    timezone: row.timezone as string,
    localDate: row.local_date as string,
    mealType: row.meal_type as string,
    originalText: row.original_text as string,
    transcription: (row.transcription as string | null) ?? null,
    parseVersion: row.parse_version as string,
    promptVersion: (row.prompt_version as string | null) ?? null,
    modelVersion: (row.model_version as string | null) ?? null,
    items: (row.items_json as NutritionMealLog["items"]) ?? [],
    totals: row.totals_json as NutritionMealLog["totals"],
    confidence: Number(row.confidence),
    source: row.source as NutritionMealLog["source"],
    warnings: (row.warnings_json as string[]) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mealToRow(log: NutritionMealLog): Record<string, unknown> {
  return {
    id: log.id,
    patient_id: log.userId,
    logged_at: log.loggedAt,
    timezone: log.timezone,
    local_date: log.localDate,
    meal_type: log.mealType,
    original_text: log.originalText,
    transcription: log.transcription,
    parse_version: log.parseVersion,
    prompt_version: log.promptVersion,
    model_version: log.modelVersion,
    items_json: log.items,
    totals_json: log.totals,
    confidence: log.confidence,
    source: log.source,
    warnings_json: log.warnings,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  };
}

export class SupabaseNutritionRepository implements NutritionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createMeal(log: NutritionMealLog): Promise<NutritionMealLog> {
    const { data, error } = await this.client.from("nutrition_meal_logs").insert(mealToRow(log)).select("*").single();
    if (error) throw new Error(`Failed to create nutrition meal: ${error.message}`);
    return rowToMeal(data);
  }

  async getMeal(userId: string, id: string): Promise<NutritionMealLog | undefined> {
    const { data, error } = await this.client.from("nutrition_meal_logs").select("*").eq("id", id).eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load nutrition meal: ${error.message}`);
    return data ? rowToMeal(data) : undefined;
  }

  async listMeals(userId: string, from?: string, to?: string): Promise<readonly NutritionMealLog[]> {
    let query = this.client.from("nutrition_meal_logs").select("*").eq("patient_id", userId).order("logged_at", { ascending: true });
    if (from) query = query.gte("local_date", from);
    if (to) query = query.lte("local_date", to);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list nutrition meals: ${error.message}`);
    return (data ?? []).map((row) => rowToMeal(row as Record<string, unknown>));
  }

  async updateMeal(userId: string, id: string, patch: Partial<NutritionMealLog>): Promise<NutritionMealLog> {
    const existing = await this.getMeal(userId, id);
    if (!existing) throw new Error("Meal not found");
    const updated: NutritionMealLog = { ...existing, ...patch, id: existing.id, userId: existing.userId, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client.from("nutrition_meal_logs").update(mealToRow(updated)).eq("id", id).eq("patient_id", userId).select("*").single();
    if (error) throw new Error(`Failed to update nutrition meal: ${error.message}`);
    return rowToMeal(data);
  }

  async deleteMeal(userId: string, id: string): Promise<void> {
    const { error } = await this.client.from("nutrition_meal_logs").delete().eq("id", id).eq("patient_id", userId);
    if (error) throw new Error(`Failed to delete nutrition meal: ${error.message}`);
  }

  async recentIdentical(userId: string, originalText: string, sinceIso: string): Promise<NutritionMealLog | undefined> {
    const { data, error } = await this.client
      .from("nutrition_meal_logs")
      .select("*")
      .eq("patient_id", userId)
      .ilike("original_text", originalText.trim())
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to check duplicate nutrition meal: ${error.message}`);
    const row = data?.[0];
    return row ? rowToMeal(row as Record<string, unknown>) : undefined;
  }

  async getTargets(userId: string): Promise<NutritionTargets | null> {
    const { data, error } = await this.client.from("nutrition_targets").select("*").eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load nutrition targets: ${error.message}`);
    return data ? ((data as { targets_json: NutritionTargets }).targets_json ?? null) : null;
  }

  async putTargets(userId: string, targets: NutritionTargets | null): Promise<NutritionTargets | null> {
    const { error } = await this.client.from("nutrition_targets").upsert({
      patient_id: userId,
      targets_json: targets,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to save nutrition targets: ${error.message}`);
    return targets;
  }

  async getDayStatus(userId: string, localDate: string): Promise<DayStatus | undefined> {
    const { data, error } = await this.client
      .from("nutrition_day_status")
      .select("*")
      .eq("patient_id", userId)
      .eq("local_date", localDate)
      .maybeSingle();
    if (error) throw new Error(`Failed to load day status: ${error.message}`);
    return data ? { localDate: data.local_date as string, completeness: data.completeness as DayStatus["completeness"] } : undefined;
  }

  async listDayStatus(userId: string, from: string, to: string): Promise<readonly DayStatus[]> {
    const { data, error } = await this.client
      .from("nutrition_day_status")
      .select("*")
      .eq("patient_id", userId)
      .gte("local_date", from)
      .lte("local_date", to);
    if (error) throw new Error(`Failed to list day status: ${error.message}`);
    return (data ?? []).map((row) => ({
      localDate: row.local_date as string,
      completeness: row.completeness as DayStatus["completeness"],
    }));
  }

  async putDayStatus(userId: string, status: DayStatus): Promise<DayStatus> {
    const { error } = await this.client.from("nutrition_day_status").upsert({
      patient_id: userId,
      local_date: status.localDate,
      completeness: status.completeness,
    });
    if (error) throw new Error(`Failed to save day status: ${error.message}`);
    return status;
  }

  async getProfile(userId: string): Promise<NutritionProfile | undefined> {
    const { data, error } = await this.client.from("nutrition_profiles").select("*").eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load nutrition profile: ${error.message}`);
    if (!data) return undefined;
    return {
      userId,
      timezone: data.timezone as string,
      units: "metric",
      onboardingComplete: Boolean(data.onboarding_complete),
      targetsSkipped: Boolean(data.targets_skipped),
      updatedAt: data.updated_at as string,
    };
  }

  async putProfile(profile: NutritionProfile): Promise<NutritionProfile> {
    const { error } = await this.client.from("nutrition_profiles").upsert({
      patient_id: profile.userId,
      timezone: profile.timezone,
      units: profile.units,
      onboarding_complete: profile.onboardingComplete,
      targets_skipped: profile.targetsSkipped,
      updated_at: profile.updatedAt,
    });
    if (error) throw new Error(`Failed to save nutrition profile: ${error.message}`);
    return profile;
  }

  async listCustomFoods(userId: string): Promise<readonly NutritionCustomFood[]> {
    const { data, error } = await this.client.from("nutrition_custom_foods").select("*").eq("patient_id", userId).is("archived_at", null);
    if (error) throw new Error(`Failed to list custom foods: ${error.message}`);
    return (data ?? []).map((row) => this.rowToCustom(row as Record<string, unknown>));
  }

  async getCustomFood(userId: string, id: string): Promise<NutritionCustomFood | undefined> {
    const { data, error } = await this.client.from("nutrition_custom_foods").select("*").eq("id", id).eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load custom food: ${error.message}`);
    return data ? this.rowToCustom(data as Record<string, unknown>) : undefined;
  }

  async createCustomFood(food: NutritionCustomFood): Promise<NutritionCustomFood> {
    const { data, error } = await this.client.from("nutrition_custom_foods").insert(this.customToRow(food)).select("*").single();
    if (error) throw new Error(`Failed to create custom food: ${error.message}`);
    return this.rowToCustom(data as Record<string, unknown>);
  }

  async updateCustomFood(userId: string, id: string, patch: Partial<NutritionCustomFood>): Promise<NutritionCustomFood> {
    const existing = await this.getCustomFood(userId, id);
    if (!existing) throw new Error("Custom food not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client.from("nutrition_custom_foods").update(this.customToRow(updated)).eq("id", id).eq("patient_id", userId).select("*").single();
    if (error) throw new Error(`Failed to update custom food: ${error.message}`);
    return this.rowToCustom(data as Record<string, unknown>);
  }

  async listSavedMeals(userId: string): Promise<readonly NutritionSavedMeal[]> {
    const { data, error } = await this.client.from("nutrition_saved_meals").select("*").eq("patient_id", userId).is("archived_at", null);
    if (error) throw new Error(`Failed to list saved meals: ${error.message}`);
    return (data ?? []).map((row) => this.rowToSaved(row as Record<string, unknown>));
  }

  async getSavedMeal(userId: string, id: string): Promise<NutritionSavedMeal | undefined> {
    const { data, error } = await this.client.from("nutrition_saved_meals").select("*").eq("id", id).eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load saved meal: ${error.message}`);
    return data ? this.rowToSaved(data as Record<string, unknown>) : undefined;
  }

  async createSavedMeal(meal: NutritionSavedMeal): Promise<NutritionSavedMeal> {
    const { data, error } = await this.client.from("nutrition_saved_meals").insert(this.savedToRow(meal)).select("*").single();
    if (error) throw new Error(`Failed to create saved meal: ${error.message}`);
    return this.rowToSaved(data as Record<string, unknown>);
  }

  async updateSavedMeal(userId: string, id: string, patch: Partial<NutritionSavedMeal>): Promise<NutritionSavedMeal> {
    const existing = await this.getSavedMeal(userId, id);
    if (!existing) throw new Error("Saved meal not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client.from("nutrition_saved_meals").update(this.savedToRow(updated)).eq("id", id).eq("patient_id", userId).select("*").single();
    if (error) throw new Error(`Failed to update saved meal: ${error.message}`);
    return this.rowToSaved(data as Record<string, unknown>);
  }

  async deleteSavedMeal(userId: string, id: string): Promise<void> {
    const { error } = await this.client.from("nutrition_saved_meals").delete().eq("id", id).eq("patient_id", userId);
    if (error) throw new Error(`Failed to delete saved meal: ${error.message}`);
  }

  async listRecipes(userId: string): Promise<readonly NutritionRecipe[]> {
    const { data, error } = await this.client.from("nutrition_recipes").select("*").eq("patient_id", userId).is("archived_at", null);
    if (error) throw new Error(`Failed to list recipes: ${error.message}`);
    return (data ?? []).map((row) => this.rowToRecipe(row as Record<string, unknown>));
  }

  async getRecipe(userId: string, id: string): Promise<NutritionRecipe | undefined> {
    const { data, error } = await this.client.from("nutrition_recipes").select("*").eq("id", id).eq("patient_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to load recipe: ${error.message}`);
    return data ? this.rowToRecipe(data as Record<string, unknown>) : undefined;
  }

  async createRecipe(recipe: NutritionRecipe): Promise<NutritionRecipe> {
    const { data, error } = await this.client.from("nutrition_recipes").insert(this.recipeToRow(recipe)).select("*").single();
    if (error) throw new Error(`Failed to create recipe: ${error.message}`);
    return this.rowToRecipe(data as Record<string, unknown>);
  }

  async updateRecipe(userId: string, id: string, patch: Partial<NutritionRecipe>): Promise<NutritionRecipe> {
    const existing = await this.getRecipe(userId, id);
    if (!existing) throw new Error("Recipe not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client.from("nutrition_recipes").update(this.recipeToRow(updated)).eq("id", id).eq("patient_id", userId).select("*").single();
    if (error) throw new Error(`Failed to update recipe: ${error.message}`);
    return this.rowToRecipe(data as Record<string, unknown>);
  }

  async listFavourites(userId: string): Promise<readonly NutritionFavourite[]> {
    const { data, error } = await this.client.from("nutrition_favourite_foods").select("*").eq("patient_id", userId);
    if (error) throw new Error(`Failed to list favourites: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      userId: row.patient_id as string,
      foodKey: row.food_key as string,
      foodName: row.food_name as string,
      brand: (row.brand as string | null) ?? null,
      sourceDataset: (row.source_dataset as string | null) ?? null,
      sourceFoodId: (row.source_food_id as string | null) ?? null,
      customFoodId: (row.custom_food_id as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
  }

  async addFavourite(favourite: NutritionFavourite): Promise<NutritionFavourite> {
    const { data, error } = await this.client
      .from("nutrition_favourite_foods")
      .insert({
        id: favourite.id,
        patient_id: favourite.userId,
        food_key: favourite.foodKey,
        food_name: favourite.foodName,
        brand: favourite.brand,
        source_dataset: favourite.sourceDataset,
        source_food_id: favourite.sourceFoodId,
        custom_food_id: favourite.customFoodId,
        created_at: favourite.createdAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to add favourite: ${error.message}`);
    return favourite;
  }

  async removeFavourite(userId: string, id: string): Promise<void> {
    const { error } = await this.client.from("nutrition_favourite_foods").delete().eq("id", id).eq("patient_id", userId);
    if (error) throw new Error(`Failed to remove favourite: ${error.message}`);
  }

  async recordEvent(event: NutritionEvent): Promise<void> {
    const { error } = await this.client.from("nutrition_events").insert({
      id: event.id,
      patient_id: event.userId,
      name: event.name,
      created_at: event.createdAt,
    });
    if (error) throw new Error(`Failed to record nutrition event: ${error.message}`);
  }

  async deleteAllUserData(userId: string): Promise<void> {
    await this.client.from("nutrition_meal_logs").delete().eq("patient_id", userId);
    await this.client.from("nutrition_targets").delete().eq("patient_id", userId);
    await this.client.from("nutrition_day_status").delete().eq("patient_id", userId);
    await this.client.from("nutrition_profiles").delete().eq("patient_id", userId);
    await this.client.from("nutrition_custom_foods").delete().eq("patient_id", userId);
    await this.client.from("nutrition_saved_meals").delete().eq("patient_id", userId);
    await this.client.from("nutrition_recipes").delete().eq("patient_id", userId);
    await this.client.from("nutrition_favourite_foods").delete().eq("patient_id", userId);
    await this.client.from("nutrition_events").delete().eq("patient_id", userId);
  }

  private rowToCustom(row: Record<string, unknown>): NutritionCustomFood {
    return {
      id: row.id as string,
      userId: row.patient_id as string,
      name: row.name as string,
      brand: (row.brand as string | null) ?? null,
      servingDescription: (row.serving_description as string | null) ?? null,
      servingGrams: row.serving_grams === null || row.serving_grams === undefined ? null : Number(row.serving_grams),
      nutrientsPer100g: row.nutrients_per_100g_json as NutritionCustomFood["nutrientsPer100g"],
      sourceNote: (row.source_note as string | null) ?? null,
      archivedAt: (row.archived_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private customToRow(food: NutritionCustomFood): Record<string, unknown> {
    return {
      id: food.id,
      patient_id: food.userId,
      name: food.name,
      brand: food.brand,
      serving_description: food.servingDescription,
      serving_grams: food.servingGrams,
      nutrients_per_100g_json: food.nutrientsPer100g,
      source_note: food.sourceNote,
      archived_at: food.archivedAt,
      created_at: food.createdAt,
      updated_at: food.updatedAt,
    };
  }

  private rowToSaved(row: Record<string, unknown>): NutritionSavedMeal {
    return {
      id: row.id as string,
      userId: row.patient_id as string,
      name: row.name as string,
      items: row.items_json as NutritionSavedMeal["items"],
      totals: row.totals_json as NutritionSavedMeal["totals"],
      archivedAt: (row.archived_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private savedToRow(meal: NutritionSavedMeal): Record<string, unknown> {
    return {
      id: meal.id,
      patient_id: meal.userId,
      name: meal.name,
      items_json: meal.items,
      totals_json: meal.totals,
      archived_at: meal.archivedAt,
      created_at: meal.createdAt,
      updated_at: meal.updatedAt,
    };
  }

  private rowToRecipe(row: Record<string, unknown>): NutritionRecipe {
    return {
      id: row.id as string,
      userId: row.patient_id as string,
      name: row.name as string,
      servings: Number(row.servings),
      totalWeightGrams: row.total_weight_grams === null || row.total_weight_grams === undefined ? null : Number(row.total_weight_grams),
      items: row.items_json as NutritionRecipe["items"],
      nutrientsPerServing: row.nutrients_per_serving_json as NutritionRecipe["nutrientsPerServing"],
      archivedAt: (row.archived_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private recipeToRow(recipe: NutritionRecipe): Record<string, unknown> {
    return {
      id: recipe.id,
      patient_id: recipe.userId,
      name: recipe.name,
      servings: recipe.servings,
      total_weight_grams: recipe.totalWeightGrams,
      items_json: recipe.items,
      nutrients_per_serving_json: recipe.nutrientsPerServing,
      archived_at: recipe.archivedAt,
      created_at: recipe.createdAt,
      updated_at: recipe.updatedAt,
    };
  }
}
