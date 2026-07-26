import type { FastifyInstance } from "fastify";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";
import { FoodModuleError } from "../food/errors.js";
import { validateCustomFoodInput } from "./validation.js";

export function registerCustomFoodRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/custom-foods", { preHandler: app.requireAuth }, async (request, reply) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;
    try {
      const normalized = validateCustomFoodInput({
        foodType: body.foodType as never,
        name: String(body.name ?? ""),
        brand: body.brand as string | undefined,
        servingDescription: body.servingDescription as string | undefined,
        servingGrams: body.servingGrams !== undefined ? Number(body.servingGrams) : undefined,
        carbohydratePerServingGrams:
          body.carbohydratePerServingGrams !== undefined ? Number(body.carbohydratePerServingGrams) : undefined,
        carbohydratePer100gGrams:
          body.carbohydratePer100gGrams !== undefined ? Number(body.carbohydratePer100gGrams) : undefined,
      });
      const record = await state.customFoodsRepository.create(patientId, normalized);
      reply.code(201);
      return record;
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.get("/api/v1/custom-foods", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const query = request.query as Record<string, unknown>;
    const includeArchived = query.includeArchived === "true";
    const foods = await state.customFoodsRepository.list(patientId, includeArchived);
    return { foods };
  });

  app.get("/api/v1/custom-foods/:id", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const food = await state.customFoodsRepository.getById(id);
    if (!food || food.patientId !== patientId) {
      throw new HttpError(404, "CUSTOM_FOOD_NOT_FOUND", "The requested custom food was not found.");
    }
    return food;
  });

  app.patch("/api/v1/custom-foods/:id", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.customFoodsRepository.getById(id);
    if (!existing || existing.patientId !== patientId) {
      throw new HttpError(404, "CUSTOM_FOOD_NOT_FOUND", "The requested custom food was not found.");
    }
    const body = request.body as Record<string, unknown>;
    try {
      const normalized = validateCustomFoodInput({
        foodType: (body.foodType as never) ?? existing.foodType,
        name: String(body.name ?? existing.name),
        brand: (body.brand as string | undefined) ?? existing.brand,
        servingDescription: (body.servingDescription as string | undefined) ?? existing.servingDescription,
        servingGrams:
          body.servingGrams !== undefined
            ? Number(body.servingGrams)
            : existing.servingGrams !== null
              ? Number(existing.servingGrams)
              : undefined,
        carbohydratePerServingGrams:
          body.carbohydratePerServingGrams !== undefined
            ? Number(body.carbohydratePerServingGrams)
            : existing.carbohydratePerServingGrams !== null
              ? Number(existing.carbohydratePerServingGrams)
              : undefined,
        carbohydratePer100gGrams:
          body.carbohydratePer100gGrams !== undefined
            ? Number(body.carbohydratePer100gGrams)
            : existing.carbohydratePer100gGrams !== null
              ? Number(existing.carbohydratePer100gGrams)
              : undefined,
      });
      return await state.customFoodsRepository.update(id, normalized);
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.post("/api/v1/custom-foods/:id/archive", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.customFoodsRepository.getById(id);
    if (!existing || existing.patientId !== patientId) {
      throw new HttpError(404, "CUSTOM_FOOD_NOT_FOUND", "The requested custom food was not found.");
    }
    return state.customFoodsRepository.setArchived(id, true);
  });

  app.post("/api/v1/custom-foods/:id/unarchive", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const existing = await state.customFoodsRepository.getById(id);
    if (!existing || existing.patientId !== patientId) {
      throw new HttpError(404, "CUSTOM_FOOD_NOT_FOUND", "The requested custom food was not found.");
    }
    return state.customFoodsRepository.setArchived(id, false);
  });
}
