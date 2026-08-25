import type { FastifyInstance } from "fastify";
import {
  CORE_DISPLAY_NUTRIENTS,
  PARSER_VERSION,
  PROMPT_VERSION,
  buildDailyInsight,
  coverageFromDays,
  dailyTotalsFromMeals,
  detectPatterns,
  emptyPanel,
  inferMealType,
  localDateFromInstant,
  localHourFromInstant,
  nutrientContributions,
  periodAverages,
  rangeStart,
  remainingCopy,
  remainingTowardTarget,
  scaleNutrients,
  sumNutrients,
  targetAdherence,
  type NutrientKey,
  type NutritionMealItem,
  type NutritionMealLog,
  type NutritionTargets,
  type TimeRange,
} from "@diabetes-companion/food-engine";
import { extractFoodsFromParsedMeal, parseMeal } from "@diabetes-companion/natural-language";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";
import { searchFoods } from "../food/search.js";
import { getMeasures } from "../food/measures.js";
import { interpretMealText } from "./interpret.js";
import { loadResolveContext, resolveFoodComponent } from "./resolve.js";
import { newId } from "./types.js";
import type { NutritionCustomFood, NutritionRecipe, NutritionSavedMeal } from "./types.js";

const RANGES: readonly TimeRange[] = ["today", "7d", "30d", "90d", "365d", "all"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requireUser(request: { patientId?: string }): string {
  if (!request.patientId) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");
  return request.patientId;
}

function timezoneOf(body: Record<string, unknown>, fallback = "Australia/Sydney"): string {
  return typeof body.timezone === "string" && body.timezone.length > 0 ? body.timezone : fallback;
}

function requireLocalDate(iso: string, timezone: string): string {
  try {
    return localDateFromInstant(iso, timezone);
  } catch {
    throw new HttpError(400, "INVALID_INPUT", "loggedAt must be a valid timestamp.");
  }
}

async function mealsForRange(state: AppState, userId: string, range: TimeRange, timezone: string, today: string) {
  const all = await state.nutritionRepository.listMeals(userId);
  const earliest = all[0]?.localDate ?? today;
  const from = rangeStart(today, range, earliest) ?? today;
  const meals = all.filter((meal) => meal.localDate >= from && meal.localDate <= today);
  const status = await state.nutritionRepository.listDayStatus(userId, from, today);
  const days = dailyTotalsFromMeals(meals, [...status], from, today);
  return { from, today, meals, days, status };
}

export function registerNutritionRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/nutrition/interpret", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new HttpError(400, "INVALID_INPUT", "Meal text is required.");
    const sourceType = body.sourceType === "voice" ? "voice" : "text";
    const timezone = timezoneOf(body);
    const loggedAt = typeof body.loggedAt === "string" ? body.loggedAt : undefined;
    const interpreted = await interpretMealText(state, userId, { text, sourceType, timezone, loggedAt, mealType: typeof body.mealType === "string" ? body.mealType : undefined });
    if (state.config.nodeEnv !== "production") {
      request.log.info(
        {
          stage: "nutrition_interpret",
          parseSource: interpreted.parsedMeal.parseSource,
          itemCount: interpreted.items.length,
          unresolved: interpreted.unresolved.length,
        },
        "nutrition_pipeline",
      );
    }
    return interpreted;
  });

  app.post("/api/v1/nutrition/resolve-item", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const phrase = typeof body.phrase === "string" ? body.phrase : "";
    if (!phrase) throw new HttpError(400, "INVALID_INPUT", "Food phrase is required.");
    const parsed = parseMeal(typeof body.text === "string" && body.text.length > 0 ? String(body.text) : phrase);
    const extraction = extractFoodsFromParsedMeal(parsed);
    const component = extraction?.components[0];
    if (!component) throw new HttpError(400, "INVALID_INPUT", "Could not parse that food phrase.");
    const quantity = body.quantity === null || body.quantity === undefined ? component.quantity.value : Number(body.quantity);
    const unit = typeof body.unit === "string" ? body.unit : component.canonicalUnit;
    const patched = {
      ...component,
      quantity: { ...component.quantity, value: Number.isFinite(quantity as number) ? (quantity as number) : null },
      canonicalUnit: (unit as typeof component.canonicalUnit) ?? component.canonicalUnit,
      quantityKind:
        unit === "g" || unit === "kg"
          ? "GRAMS"
          : unit === "ml" || unit === "l"
            ? "MILLILITRES"
            : component.quantityKind,
    } as typeof component;
    const context = await loadResolveContext(userId, state.db, state.databaseSha256, state.nutritionRepository);
    const resolved = resolveFoodComponent(patched, context, {
      sourceDataset: typeof body.sourceDataset === "string" ? body.sourceDataset : undefined,
      sourceFoodId: typeof body.sourceFoodId === "string" ? body.sourceFoodId : undefined,
      measureId: typeof body.measureId === "string" ? body.measureId : undefined,
      customFoodId: typeof body.customFoodId === "string" ? body.customFoodId : undefined,
    });
    return { item: resolved.expanded[0] ?? resolved.item, candidates: resolved.candidates, expanded: resolved.expanded };
  });

  app.post("/api/v1/nutrition/meals", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const items = Array.isArray(body.items) ? (body.items as NutritionMealItem[]) : [];
    if (items.length === 0) throw new HttpError(400, "INVALID_INPUT", "A meal must include at least one item.");
    const timezone = timezoneOf(body);
    const loggedAt = typeof body.loggedAt === "string" ? body.loggedAt : new Date().toISOString();
    const originalText = typeof body.originalText === "string" ? body.originalText : "";
    if (!body.confirmDuplicate) {
      const duplicate = await state.nutritionRepository.recentIdentical(
        userId,
        originalText,
        new Date(Date.now() - 15_000).toISOString(),
      );
      if (duplicate) {
        throw new HttpError(
          409,
          "DUPLICATE_MEAL",
          "This looks identical to the meal you just logged. Log again?",
        );
      }
    }
    const now = new Date().toISOString();
    const log: NutritionMealLog = {
      id: newId(),
      userId,
      loggedAt,
      timezone,
      localDate: requireLocalDate(loggedAt, timezone),
      mealType: typeof body.mealType === "string" ? body.mealType : inferMealType(localHourFromInstant(loggedAt, timezone), originalText),
      originalText,
      transcription: typeof body.transcription === "string" ? body.transcription : null,
      parseVersion: typeof body.parseVersion === "string" ? body.parseVersion : PARSER_VERSION,
      promptVersion: typeof body.promptVersion === "string" ? body.promptVersion : PROMPT_VERSION,
      modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : null,
      items,
      totals: sumNutrients(items.map((item) => item.nutrients)),
      confidence: typeof body.confidence === "number" ? body.confidence : 0.8,
      source: (body.source as NutritionMealLog["source"]) ?? "text",
      warnings: Array.isArray(body.warnings) ? (body.warnings as string[]) : [],
      createdAt: now,
      updatedAt: now,
    };
    const created = await state.nutritionRepository.createMeal(log);
    await state.nutritionRepository.recordEvent({ id: newId(), userId, name: "meal_logged", createdAt: now });
    return created;
  });

  app.get("/api/v1/nutrition/meals", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const query = asRecord(request.query);
    const meals = await state.nutritionRepository.listMeals(
      userId,
      typeof query.from === "string" ? query.from : undefined,
      typeof query.to === "string" ? query.to : undefined,
    );
    return { meals };
  });

  app.get("/api/v1/nutrition/meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { id } = request.params as { id: string };
    const meal = await state.nutritionRepository.getMeal(userId, id);
    if (!meal) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
    return meal;
  });

  app.patch("/api/v1/nutrition/meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await state.nutritionRepository.getMeal(userId, id);
    if (!existing) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
    const body = asRecord(request.body);
    const items = Array.isArray(body.items) ? (body.items as NutritionMealItem[]) : existing.items;
    const timezone = typeof body.timezone === "string" ? body.timezone : existing.timezone;
    const loggedAt = typeof body.loggedAt === "string" ? body.loggedAt : existing.loggedAt;
    const updated = await state.nutritionRepository.updateMeal(userId, id, {
      items,
      totals: sumNutrients(items.map((item) => item.nutrients)),
      timezone,
      loggedAt,
      localDate: requireLocalDate(loggedAt, timezone),
      mealType: typeof body.mealType === "string" ? body.mealType : existing.mealType,
      originalText: typeof body.originalText === "string" ? body.originalText : existing.originalText,
      warnings: Array.isArray(body.warnings) ? (body.warnings as string[]) : existing.warnings,
    });
    await state.nutritionRepository.recordEvent({ id: newId(), userId, name: "meal_edited", createdAt: new Date().toISOString() });
    return updated;
  });

  app.delete("/api/v1/nutrition/meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await state.nutritionRepository.getMeal(userId, id);
    if (!existing) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
    await state.nutritionRepository.deleteMeal(userId, id);
    await state.nutritionRepository.recordEvent({ id: newId(), userId, name: "meal_deleted", createdAt: new Date().toISOString() });
    return { ok: true };
  });

  app.post("/api/v1/nutrition/meals/:id/repeat", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await state.nutritionRepository.getMeal(userId, id);
    if (!existing) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
    const body = asRecord(request.body);
    const timezone = timezoneOf(body, existing.timezone);
    const loggedAt = typeof body.loggedAt === "string" ? body.loggedAt : new Date().toISOString();
    const now = new Date().toISOString();
    const copy: NutritionMealLog = {
      ...existing,
      id: newId(),
      loggedAt,
      timezone,
      localDate: requireLocalDate(loggedAt, timezone),
      source: "repeat",
      createdAt: now,
      updatedAt: now,
      items: existing.items.map((item) => ({ ...item, id: newId() })),
    };
    return state.nutritionRepository.createMeal(copy);
  });

  app.get("/api/v1/nutrition/days/:date", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { date } = request.params as { date: string };
    const query = asRecord(request.query);
    const timezone = timezoneOf(query);
    const meals = (await state.nutritionRepository.listMeals(userId, date, date)).filter((meal) => meal.localDate === date);
    const status = await state.nutritionRepository.getDayStatus(userId, date);
    const totals = sumNutrients(meals.map((meal) => meal.totals));
    const targets = await state.nutritionRepository.getTargets(userId);
    const insight = buildDailyInsight(totals, targets, meals);
    const remaining = Object.fromEntries(
      CORE_DISPLAY_NUTRIENTS.map((key) => {
        const target = targets ? (targets as Record<string, unknown>)[key] : null;
        const value = remainingTowardTarget(totals[key], target as NutritionTargets["proteinG"]);
        return [key, { remaining: value, copy: remainingCopy(key, value, target as NutritionTargets["proteinG"]) }];
      }),
    );
    void timezone;
    return { date, meals, totals, completeness: status?.completeness ?? "unmarked", insight, remaining, targets };
  });

  app.put("/api/v1/nutrition/days/:date/completeness", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { date } = request.params as { date: string };
    const body = asRecord(request.body);
    if (body.completeness !== "complete" && body.completeness !== "partial") {
      throw new HttpError(400, "INVALID_INPUT", "Completeness must be complete or partial.");
    }
    return state.nutritionRepository.putDayStatus(userId, { localDate: date, completeness: body.completeness });
  });

  app.get("/api/v1/nutrition/targets", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    return { targets: await state.nutritionRepository.getTargets(userId) };
  });

  app.put("/api/v1/nutrition/targets", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const targets = (body.targets ?? null) as NutritionTargets | null;
    return { targets: await state.nutritionRepository.putTargets(userId, targets) };
  });

  app.get("/api/v1/nutrition/profile", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const profile = await state.nutritionRepository.getProfile(userId);
    return {
      profile: profile ?? {
        userId,
        timezone: "Australia/Sydney",
        units: "metric",
        onboardingComplete: false,
        targetsSkipped: false,
        updatedAt: new Date().toISOString(),
      },
    };
  });

  app.put("/api/v1/nutrition/profile", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const profile = await state.nutritionRepository.putProfile({
      userId,
      timezone: typeof body.timezone === "string" ? body.timezone : "Australia/Sydney",
      units: "metric",
      onboardingComplete: Boolean(body.onboardingComplete),
      targetsSkipped: Boolean(body.targetsSkipped),
      updatedAt: new Date().toISOString(),
    });
    return { profile };
  });

  app.get("/api/v1/nutrition/summary", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const query = asRecord(request.query);
    const range = RANGES.includes(query.range as TimeRange) ? (query.range as TimeRange) : "7d";
    const timezone = timezoneOf(query);
    const today = localDateFromInstant(new Date().toISOString(), timezone);
    const { from, meals, days } = await mealsForRange(state, userId, range, timezone, today);
    const targets = await state.nutritionRepository.getTargets(userId);
    const coverage = coverageFromDays(days);
    const averages = periodAverages(days);
    return {
      range,
      from,
      to: today,
      coverage,
      averages,
      adherence: targets ? targetAdherence(days, targets) : [],
      patterns: detectPatterns(days, meals),
      targets,
      days,
    };
  });

  app.get("/api/v1/nutrition/nutrients/:key", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const { key } = request.params as { key: NutrientKey };
    const query = asRecord(request.query);
    const range = RANGES.includes(query.range as TimeRange) ? (query.range as TimeRange) : "30d";
    const timezone = timezoneOf(query);
    const today = localDateFromInstant(new Date().toISOString(), timezone);
    const { meals, days } = await mealsForRange(state, userId, range, timezone, today);
    const targets = await state.nutritionRepository.getTargets(userId);
    return {
      key,
      range,
      coverage: coverageFromDays(days),
      averages: periodAverages(days),
      days: days.map((day) => ({ date: day.localDate, value: day.totals[key], logged: day.logged, completeness: day.completeness })),
      sources: nutrientContributions(meals, key),
      adherence: targets ? targetAdherence(days, targets).filter((row) => row.key === key) : [],
    };
  });

  app.get("/api/v1/nutrition/recent-foods", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const meals = await state.nutritionRepository.listMeals(userId);
    const seen = new Map<string, NutritionMealItem>();
    for (const meal of [...meals].reverse()) {
      for (const item of meal.items) {
        const key = item.identity.foodId ?? item.identity.foodName;
        if (!seen.has(key)) seen.set(key, item);
      }
    }
    return { foods: [...seen.values()].slice(0, 30) };
  });

  app.get("/api/v1/nutrition/favourites", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    return { favourites: await state.nutritionRepository.listFavourites(userId) };
  });

  app.post("/api/v1/nutrition/favourites", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const favourite = await state.nutritionRepository.addFavourite({
      id: newId(),
      userId,
      foodKey: String(body.foodKey ?? body.foodName ?? newId()),
      foodName: String(body.foodName ?? "Food"),
      brand: typeof body.brand === "string" ? body.brand : null,
      sourceDataset: typeof body.sourceDataset === "string" ? body.sourceDataset : null,
      sourceFoodId: typeof body.sourceFoodId === "string" ? body.sourceFoodId : null,
      customFoodId: typeof body.customFoodId === "string" ? body.customFoodId : null,
      createdAt: new Date().toISOString(),
    });
    return favourite;
  });

  app.delete("/api/v1/nutrition/favourites/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    await state.nutritionRepository.removeFavourite(userId, (request.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/api/v1/nutrition/saved-meals", { preHandler: app.requireAuth }, async (request) => {
    return { meals: await state.nutritionRepository.listSavedMeals(requireUser(request)) };
  });

  app.post("/api/v1/nutrition/saved-meals", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const items = Array.isArray(body.items) ? (body.items as NutritionMealItem[]) : [];
    const now = new Date().toISOString();
    const meal: NutritionSavedMeal = {
      id: newId(),
      userId,
      name: String(body.name ?? "Saved meal").trim() || "Saved meal",
      items,
      totals: sumNutrients(items.map((item) => item.nutrients)),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return state.nutritionRepository.createSavedMeal(meal);
  });

  app.patch("/api/v1/nutrition/saved-meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const items = Array.isArray(body.items) ? (body.items as NutritionMealItem[]) : undefined;
    return state.nutritionRepository.updateSavedMeal(userId, (request.params as { id: string }).id, {
      name: typeof body.name === "string" ? body.name : undefined,
      items,
      totals: items ? sumNutrients(items.map((item) => item.nutrients)) : undefined,
    });
  });

  app.delete("/api/v1/nutrition/saved-meals/:id", { preHandler: app.requireAuth }, async (request) => {
    await state.nutritionRepository.deleteSavedMeal(requireUser(request), (request.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/api/v1/nutrition/recipes", { preHandler: app.requireAuth }, async (request) => {
    return { recipes: await state.nutritionRepository.listRecipes(requireUser(request)) };
  });

  app.post("/api/v1/nutrition/recipes", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const items = Array.isArray(body.items) ? (body.items as NutritionMealItem[]) : [];
    const servings = Number(body.servings ?? 1) || 1;
    const now = new Date().toISOString();
    const totals = sumNutrients(items.map((item) => item.nutrients));
    const recipe: NutritionRecipe = {
      id: newId(),
      userId,
      name: String(body.name ?? "Recipe").trim() || "Recipe",
      servings,
      totalWeightGrams: body.totalWeightGrams === null || body.totalWeightGrams === undefined ? null : Number(body.totalWeightGrams),
      items,
      nutrientsPerServing: scaleNutrients(totals, 1, servings),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return state.nutritionRepository.createRecipe(recipe);
  });

  app.get("/api/v1/nutrition/custom-foods", { preHandler: app.requireAuth }, async (request) => {
    return { foods: await state.nutritionRepository.listCustomFoods(requireUser(request)) };
  });

  app.post("/api/v1/nutrition/custom-foods", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const now = new Date().toISOString();
    const food: NutritionCustomFood = {
      id: newId(),
      userId,
      name: String(body.name ?? "").trim(),
      brand: typeof body.brand === "string" ? body.brand : null,
      servingDescription: typeof body.servingDescription === "string" ? body.servingDescription : null,
      servingGrams: body.servingGrams === null || body.servingGrams === undefined ? null : Number(body.servingGrams),
      nutrientsPer100g: (body.nutrientsPer100g as NutritionCustomFood["nutrientsPer100g"]) ?? emptyPanel(),
      sourceNote: typeof body.sourceNote === "string" ? body.sourceNote : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    if (!food.name) throw new HttpError(400, "INVALID_INPUT", "Custom food name is required.");
    return state.nutritionRepository.createCustomFood(food);
  });

  app.patch("/api/v1/nutrition/custom-foods/:id", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    return state.nutritionRepository.updateCustomFood(userId, (request.params as { id: string }).id, body as Partial<NutritionCustomFood>);
  });

  app.get("/api/v1/nutrition/foods/search", { preHandler: app.requireAuth }, async (request) => {
    const query = asRecord(request.query);
    return searchFoods(state.db, { query: String(query.q ?? ""), pageSize: query.pageSize ? Number(query.pageSize) : 20 });
  });

  app.get("/api/v1/nutrition/foods/:sourceDataset/:sourceFoodId/measures", { preHandler: app.requireAuth }, async (request) => {
    const params = request.params as { sourceDataset: "AUSNUT_2023" | "AFCD_RELEASE_3"; sourceFoodId: string };
    return { measures: getMeasures(state.db, params.sourceDataset, params.sourceFoodId) };
  });

  app.get("/api/v1/nutrition/export", { preHandler: app.requireAuth }, async (request, reply) => {
    const userId = requireUser(request);
    const query = asRecord(request.query);
    const meals = await state.nutritionRepository.listMeals(userId);
    const targets = await state.nutritionRepository.getTargets(userId);
    const format = query.format === "json" ? "json" : "csv";
    await state.nutritionRepository.recordEvent({ id: newId(), userId, name: "export_used", createdAt: new Date().toISOString() });
    if (format === "json") {
      return { meals, targets };
    }
    const header = [
      "date",
      "loggedAt",
      "mealType",
      "food",
      "quantity",
      "unit",
      "grams",
      "energyKcal",
      "proteinG",
      "carbohydrateG",
      "fatG",
      "fibreG",
      "sodiumMg",
    ];
    const lines = [header.join(",")];
    for (const meal of meals) {
      for (const item of meal.items) {
        lines.push(
          [
            meal.localDate,
            meal.loggedAt,
            meal.mealType,
            csv(item.identity.foodName),
            item.serving.quantity ?? "",
            item.serving.unit ?? "",
            item.serving.grams ?? "",
            item.nutrients.energyKcal ?? "",
            item.nutrients.proteinG ?? "",
            item.nutrients.carbohydrateG ?? "",
            item.nutrients.fatG ?? "",
            item.nutrients.fibreG ?? "",
            item.nutrients.sodiumMg ?? "",
          ].join(","),
        );
      }
    }
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=nutrition-export.csv");
    return lines.join("\n");
  });

  app.post("/api/v1/nutrition/events", { preHandler: app.requireAuth }, async (request) => {
    const userId = requireUser(request);
    const body = asRecord(request.body);
    const name = typeof body.name === "string" ? body.name : "unknown";
    await state.nutritionRepository.recordEvent({ id: newId(), userId, name, createdAt: new Date().toISOString() });
    return { ok: true };
  });

  app.delete("/api/v1/nutrition/account", { preHandler: app.requireAuth }, async (request) => {
    await state.nutritionRepository.deleteAllUserData(requireUser(request));
    return { ok: true };
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
