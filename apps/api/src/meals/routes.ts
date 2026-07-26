import type { FastifyInstance } from "fastify";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";
import { FoodModuleError } from "../food/errors.js";
import { validateMealComponentInput, validateMealName, type MealComponentInput } from "./validation.js";
import { calculateMealCarbohydrate } from "./calculate.js";
import type { MealComponentQuantityOverride, SavedMealRecord } from "@diabetes-companion/food-contracts";

function parseComponentInput(raw: Record<string, unknown>): MealComponentInput {
  return {
    componentSource: raw.componentSource as never,
    sourceDataset: raw.sourceDataset as string | undefined,
    sourceFoodId: raw.sourceFoodId as string | undefined,
    customFoodId: raw.customFoodId as string | undefined,
    label: String(raw.label ?? ""),
    quantityKind: raw.quantityKind as never,
    quantityGrams: raw.quantityGrams !== undefined ? Number(raw.quantityGrams) : undefined,
    quantityMillilitres: raw.quantityMillilitres !== undefined ? Number(raw.quantityMillilitres) : undefined,
    measureId: raw.measureId as string | undefined,
    measureMultiplier: raw.measureMultiplier !== undefined ? Number(raw.measureMultiplier) : undefined,
  };
}

async function assertComponentReferenceValid(
  state: AppState,
  patientId: string,
  input: ReturnType<typeof validateMealComponentInput>,
): Promise<void> {
  if (input.componentSource === "CUSTOM") {
    const food = await state.customFoodsRepository.getById(input.customFoodId!);
    if (!food || food.patientId !== patientId) {
      throw new HttpError(400, "CUSTOM_FOOD_NOT_FOUND", "The referenced custom food was not found.");
    }
    return;
  }
  const table = input.componentSource === "AUSNUT" ? "app_ausnut_foods" : "app_afcd_foods_per_100g";
  const row = state.db
    .prepare(`SELECT 1 FROM ${table} WHERE source_food_id = @sourceFoodId`)
    .get({ sourceFoodId: input.sourceFoodId });
  if (!row) throw new HttpError(400, "FOOD_NOT_FOUND", "The referenced food item was not found.");
}

function assertOwnership(meal: SavedMealRecord | undefined, patientId: string): asserts meal is SavedMealRecord {
  if (!meal || meal.patientId !== patientId) {
    throw new HttpError(404, "MEAL_NOT_FOUND", "The requested meal was not found.");
  }
}

export function registerMealRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/meals", { preHandler: app.requireAuth }, async (request, reply) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;
    try {
      const name = validateMealName(String(body.name ?? ""));
      const componentsRaw = Array.isArray(body.components) ? (body.components as Record<string, unknown>[]) : [];
      const normalizedComponents = componentsRaw.map((component) =>
        validateMealComponentInput(parseComponentInput(component)),
      );
      for (const component of normalizedComponents) {
        await assertComponentReferenceValid(state, patientId, component);
      }
      const meal = await state.savedMealsRepository.create(patientId, name, normalizedComponents);
      reply.code(201);
      return meal;
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.get("/api/v1/meals", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const query = request.query as Record<string, unknown>;
    const includeArchived = query.includeArchived === "true";
    const meals = await state.savedMealsRepository.list(patientId, includeArchived);
    return { meals };
  });

  app.get("/api/v1/meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const meal = await state.savedMealsRepository.getById(id);
    assertOwnership(meal, patientId);
    const calculation = await calculateMealCarbohydrate(meal, state.db, state.databaseSha256, state.customFoodsRepository);
    return { meal, calculation };
  });

  app.patch("/api/v1/meals/:id", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    const body = request.body as Record<string, unknown>;
    const name = validateMealName(String(body.name ?? existing.name));
    return state.savedMealsRepository.rename(id, name);
  });

  app.post("/api/v1/meals/:id/components", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    try {
      const normalized = validateMealComponentInput(parseComponentInput(request.body as Record<string, unknown>));
      await assertComponentReferenceValid(state, patientId, normalized);
      return await state.savedMealsRepository.addComponent(id, patientId, normalized);
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.patch("/api/v1/meals/:id/components/:componentId", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id, componentId } = request.params as { id: string; componentId: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    const component = existing.components.find((item) => item.id === componentId);
    if (!component) throw new HttpError(404, "MEAL_COMPONENT_NOT_FOUND", "The requested meal component was not found.");

    const body = request.body as Record<string, unknown>;
    try {
      const normalized = validateMealComponentInput({
        componentSource: component.componentSource,
        sourceDataset: component.sourceDataset,
        sourceFoodId: component.sourceFoodId,
        customFoodId: component.customFoodId,
        label: String(body.label ?? component.label),
        quantityKind: (body.quantityKind as never) ?? component.quantityKind,
        quantityGrams: body.quantityGrams !== undefined ? Number(body.quantityGrams) : undefined,
        quantityMillilitres: body.quantityMillilitres !== undefined ? Number(body.quantityMillilitres) : undefined,
        measureId: (body.measureId as string | undefined) ?? component.measureId,
        measureMultiplier: body.measureMultiplier !== undefined ? Number(body.measureMultiplier) : undefined,
      });
      return await state.savedMealsRepository.updateComponent(id, componentId, normalized);
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.delete("/api/v1/meals/:id/components/:componentId", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id, componentId } = request.params as { id: string; componentId: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    const component = existing.components.find((item) => item.id === componentId);
    if (!component) throw new HttpError(404, "MEAL_COMPONENT_NOT_FOUND", "The requested meal component was not found.");
    return state.savedMealsRepository.removeComponent(id, componentId);
  });

  app.post("/api/v1/meals/:id/duplicate", { preHandler: app.requireAuth }, async (request, reply) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    const body = request.body as Record<string, unknown>;
    const newName = validateMealName(String(body.name ?? `Copy of ${existing.name}`));
    const duplicate = await state.savedMealsRepository.duplicate(id, patientId, newName);
    reply.code(201);
    return duplicate;
  });

  app.post("/api/v1/meals/:id/archive", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    return state.savedMealsRepository.setArchived(id, true);
  });

  app.post("/api/v1/meals/:id/unarchive", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    return state.savedMealsRepository.setArchived(id, false);
  });

  app.post("/api/v1/meals/:id/calculate-carbohydrate", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.savedMealsRepository.getById(id);
    assertOwnership(existing, patientId);
    const body = request.body as Record<string, unknown>;
    const overrides = Array.isArray(body.overrides) ? (body.overrides as MealComponentQuantityOverride[]) : [];
    try {
      return await calculateMealCarbohydrate(
        existing,
        state.db,
        state.databaseSha256,
        state.customFoodsRepository,
        overrides,
      );
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });
}
