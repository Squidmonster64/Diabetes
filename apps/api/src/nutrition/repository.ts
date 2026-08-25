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

export class MemoryNutritionRepository implements NutritionRepository {
  private readonly meals = new Map<string, NutritionMealLog>();
  private readonly targets = new Map<string, NutritionTargets | null>();
  private readonly days = new Map<string, DayStatus>();
  private readonly profiles = new Map<string, NutritionProfile>();
  private readonly customFoods = new Map<string, NutritionCustomFood>();
  private readonly savedMeals = new Map<string, NutritionSavedMeal>();
  private readonly recipes = new Map<string, NutritionRecipe>();
  private readonly favourites = new Map<string, NutritionFavourite>();
  private readonly events: NutritionEvent[] = [];

  async createMeal(log: NutritionMealLog): Promise<NutritionMealLog> {
    this.meals.set(log.id, log);
    return log;
  }

  async getMeal(userId: string, id: string): Promise<NutritionMealLog | undefined> {
    const meal = this.meals.get(id);
    return meal?.userId === userId ? meal : undefined;
  }

  async listMeals(userId: string, from?: string, to?: string): Promise<readonly NutritionMealLog[]> {
    return [...this.meals.values()]
      .filter((meal) => meal.userId === userId)
      .filter((meal) => (from ? meal.localDate >= from : true) && (to ? meal.localDate <= to : true))
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  }

  async updateMeal(userId: string, id: string, patch: Partial<NutritionMealLog>): Promise<NutritionMealLog> {
    const existing = await this.getMeal(userId, id);
    if (!existing) throw new Error("Meal not found");
    const updated: NutritionMealLog = { ...existing, ...patch, id: existing.id, userId: existing.userId, updatedAt: new Date().toISOString() };
    this.meals.set(id, updated);
    return updated;
  }

  async deleteMeal(userId: string, id: string): Promise<void> {
    const existing = await this.getMeal(userId, id);
    if (!existing) throw new Error("Meal not found");
    this.meals.delete(id);
  }

  async recentIdentical(userId: string, originalText: string, sinceIso: string): Promise<NutritionMealLog | undefined> {
    const normalised = originalText.trim().toLowerCase();
    return [...this.meals.values()]
      .filter((meal) => meal.userId === userId && meal.originalText.trim().toLowerCase() === normalised && meal.createdAt >= sinceIso)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  async getTargets(userId: string): Promise<NutritionTargets | null> {
    return this.targets.get(userId) ?? null;
  }

  async putTargets(userId: string, targets: NutritionTargets | null): Promise<NutritionTargets | null> {
    this.targets.set(userId, targets);
    return targets;
  }

  async getDayStatus(userId: string, localDate: string): Promise<DayStatus | undefined> {
    return this.days.get(`${userId}:${localDate}`);
  }

  async listDayStatus(userId: string, from: string, to: string): Promise<readonly DayStatus[]> {
    return [...this.days.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, value]) => value)
      .filter((row) => row.localDate >= from && row.localDate <= to);
  }

  async putDayStatus(userId: string, status: DayStatus): Promise<DayStatus> {
    this.days.set(`${userId}:${status.localDate}`, status);
    return status;
  }

  async getProfile(userId: string): Promise<NutritionProfile | undefined> {
    return this.profiles.get(userId);
  }

  async putProfile(profile: NutritionProfile): Promise<NutritionProfile> {
    this.profiles.set(profile.userId, profile);
    return profile;
  }

  async listCustomFoods(userId: string): Promise<readonly NutritionCustomFood[]> {
    return [...this.customFoods.values()].filter((food) => food.userId === userId && !food.archivedAt);
  }

  async getCustomFood(userId: string, id: string): Promise<NutritionCustomFood | undefined> {
    const food = this.customFoods.get(id);
    return food?.userId === userId ? food : undefined;
  }

  async createCustomFood(food: NutritionCustomFood): Promise<NutritionCustomFood> {
    this.customFoods.set(food.id, food);
    return food;
  }

  async updateCustomFood(userId: string, id: string, patch: Partial<NutritionCustomFood>): Promise<NutritionCustomFood> {
    const existing = await this.getCustomFood(userId, id);
    if (!existing) throw new Error("Custom food not found");
    const updated = { ...existing, ...patch, id: existing.id, userId: existing.userId, updatedAt: new Date().toISOString() };
    this.customFoods.set(id, updated);
    return updated;
  }

  async listSavedMeals(userId: string): Promise<readonly NutritionSavedMeal[]> {
    return [...this.savedMeals.values()].filter((meal) => meal.userId === userId && !meal.archivedAt);
  }

  async getSavedMeal(userId: string, id: string): Promise<NutritionSavedMeal | undefined> {
    const meal = this.savedMeals.get(id);
    return meal?.userId === userId ? meal : undefined;
  }

  async createSavedMeal(meal: NutritionSavedMeal): Promise<NutritionSavedMeal> {
    this.savedMeals.set(meal.id, meal);
    return meal;
  }

  async updateSavedMeal(userId: string, id: string, patch: Partial<NutritionSavedMeal>): Promise<NutritionSavedMeal> {
    const existing = await this.getSavedMeal(userId, id);
    if (!existing) throw new Error("Saved meal not found");
    const updated = { ...existing, ...patch, id: existing.id, userId: existing.userId, updatedAt: new Date().toISOString() };
    this.savedMeals.set(id, updated);
    return updated;
  }

  async deleteSavedMeal(userId: string, id: string): Promise<void> {
    const existing = await this.getSavedMeal(userId, id);
    if (!existing) throw new Error("Saved meal not found");
    this.savedMeals.delete(id);
  }

  async listRecipes(userId: string): Promise<readonly NutritionRecipe[]> {
    return [...this.recipes.values()].filter((recipe) => recipe.userId === userId && !recipe.archivedAt);
  }

  async getRecipe(userId: string, id: string): Promise<NutritionRecipe | undefined> {
    const recipe = this.recipes.get(id);
    return recipe?.userId === userId ? recipe : undefined;
  }

  async createRecipe(recipe: NutritionRecipe): Promise<NutritionRecipe> {
    this.recipes.set(recipe.id, recipe);
    return recipe;
  }

  async updateRecipe(userId: string, id: string, patch: Partial<NutritionRecipe>): Promise<NutritionRecipe> {
    const existing = await this.getRecipe(userId, id);
    if (!existing) throw new Error("Recipe not found");
    const updated = { ...existing, ...patch, id: existing.id, userId: existing.userId, updatedAt: new Date().toISOString() };
    this.recipes.set(id, updated);
    return updated;
  }

  async listFavourites(userId: string): Promise<readonly NutritionFavourite[]> {
    return [...this.favourites.values()].filter((row) => row.userId === userId);
  }

  async addFavourite(favourite: NutritionFavourite): Promise<NutritionFavourite> {
    this.favourites.set(favourite.id, favourite);
    return favourite;
  }

  async removeFavourite(userId: string, id: string): Promise<void> {
    const existing = this.favourites.get(id);
    if (existing?.userId === userId) this.favourites.delete(id);
  }

  async recordEvent(event: NutritionEvent): Promise<void> {
    this.events.push(event);
  }

  async deleteAllUserData(userId: string): Promise<void> {
    for (const [id, meal] of this.meals) if (meal.userId === userId) this.meals.delete(id);
    this.targets.delete(userId);
    this.profiles.delete(userId);
    for (const key of [...this.days.keys()]) if (key.startsWith(`${userId}:`)) this.days.delete(key);
    for (const [id, food] of this.customFoods) if (food.userId === userId) this.customFoods.delete(id);
    for (const [id, meal] of this.savedMeals) if (meal.userId === userId) this.savedMeals.delete(id);
    for (const [id, recipe] of this.recipes) if (recipe.userId === userId) this.recipes.delete(id);
    for (const [id, fav] of this.favourites) if (fav.userId === userId) this.favourites.delete(id);
  }
}
