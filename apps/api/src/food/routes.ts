import type { FastifyInstance } from "fastify";
import type { SourceDataset } from "@diabetes-companion/food-contracts";
import type { AppState } from "../appState.js";
import { searchFoods } from "./search.js";
import { getMeasures } from "./measures.js";
import { calculateCarbohydrate } from "./calculate.js";
import { lookupOnlineFood } from "./onlineLookup.js";
import { FoodModuleError } from "./errors.js";
import { HttpError } from "../httpError.js";

function isSourceDataset(value: unknown): value is SourceDataset {
  return value === "AUSNUT_2023" || value === "AFCD_RELEASE_3";
}

export function registerFoodRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/v1/foods/online-lookup", { preHandler: app.requireAuth }, async (request) => {
    const query = request.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q : "";
    return lookupOnlineFood(q);
  });

  app.get("/api/v1/foods/search", async (request) => {
    const query = request.query as Record<string, unknown>;
    const sourceDataset = isSourceDataset(query.sourceDataset) ? query.sourceDataset : undefined;
    try {
      return searchFoods(state.db, {
        query: String(query.q ?? ""),
        sourceDataset,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      });
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });

  app.get("/api/v1/foods/:sourceDataset/:sourceFoodId", async (request) => {
    const params = request.params as { sourceDataset: string; sourceFoodId: string };
    if (!isSourceDataset(params.sourceDataset)) {
      throw new HttpError(400, "INVALID_SOURCE_DATASET", "Unknown source dataset.");
    }
    const table = params.sourceDataset === "AUSNUT_2023" ? "app_ausnut_foods" : "app_afcd_foods_per_100g";
    const row = state.db
      .prepare(
        `SELECT source_dataset, source_food_id, public_food_key, food_name, food_description, classification,
                carbohydrate_basis, provenance_table,
                carbohydrate_without_sugar_alcohols_per_100g IS NOT NULL
                  OR carbohydrate_with_sugar_alcohols_per_100g IS NOT NULL AS has_gram_data
         FROM ${table} WHERE source_food_id = @sourceFoodId`,
      )
      .get({ sourceFoodId: params.sourceFoodId }) as Record<string, unknown> | undefined;
    if (!row) throw new HttpError(404, "FOOD_NOT_FOUND", "The requested food item was not found.");
    return {
      sourceDataset: row.source_dataset,
      sourceFoodId: row.source_food_id,
      publicFoodKey: row.public_food_key,
      foodName: row.food_name,
      foodDescription: row.food_description,
      classification: row.classification,
      carbohydrateBasis: row.carbohydrate_basis,
      hasGramData: Boolean(row.has_gram_data),
      hasMillilitreData: false,
      provenanceTable: row.provenance_table,
    };
  });

  app.get("/api/v1/foods/:sourceDataset/:sourceFoodId/measures", async (request) => {
    const params = request.params as { sourceDataset: string; sourceFoodId: string };
    if (!isSourceDataset(params.sourceDataset)) {
      throw new HttpError(400, "INVALID_SOURCE_DATASET", "Unknown source dataset.");
    }
    return { measures: getMeasures(state.db, params.sourceDataset, params.sourceFoodId) };
  });

  app.post("/api/v1/foods/calculate-carbohydrate", async (request) => {
    const body = request.body as Record<string, unknown>;
    if (!isSourceDataset(body.sourceDataset)) {
      throw new HttpError(400, "INVALID_SOURCE_DATASET", "Unknown source dataset.");
    }
    try {
      if (body.kind === "MEASURE") {
        return calculateCarbohydrate(
          state.db,
          {
            kind: "MEASURE",
            sourceDataset: body.sourceDataset,
            sourceFoodId: String(body.sourceFoodId),
            measureId: String(body.measureId),
            measureMultiplier: Number(body.measureMultiplier),
          },
          state.databaseSha256,
        );
      }
      if (body.kind === "MILLILITRES") {
        return calculateCarbohydrate(
          state.db,
          {
            kind: "MILLILITRES",
            sourceDataset: body.sourceDataset,
            sourceFoodId: String(body.sourceFoodId),
            millilitres: Number(body.millilitres),
          },
          state.databaseSha256,
        );
      }
      return calculateCarbohydrate(
        state.db,
        {
          kind: "GRAMS",
          sourceDataset: body.sourceDataset,
          sourceFoodId: String(body.sourceFoodId),
          grams: Number(body.grams),
        },
        state.databaseSha256,
      );
    } catch (error) {
      if (error instanceof FoodModuleError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });
}
