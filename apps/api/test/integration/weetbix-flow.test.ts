import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestServer, devAuthHeader, baseSettingsPayload, baseBolusPayload } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await makeTestServer());
});

afterAll(async () => {
  await app.close();
});

describe("Weet-Bix end-to-end acceptance workflow", () => {
  it("search -> select -> portion -> carb calc -> glucose entry -> preview -> confirm -> history", async () => {
    const patient = devAuthHeader("patient_weetbix");

    const searchResponse = await app.inject({ method: "GET", url: "/api/v1/foods/search?q=Weet-Bix" });
    expect(searchResponse.statusCode).toBe(200);
    const search = searchResponse.json();
    expect(search.results.length).toBeGreaterThan(0);
    const food = search.results[0];

    const carbResponse = await app.inject({
      method: "POST",
      url: "/api/v1/foods/calculate-carbohydrate",
      payload: { kind: "GRAMS", sourceDataset: food.sourceDataset, sourceFoodId: food.sourceFoodId, grams: 30 },
    });
    expect(carbResponse.statusCode).toBe(200);
    const carb = carbResponse.json();
    expect(carb.carbohydrateGrams).toBeGreaterThan(0);

    const settingsResponse = await app.inject({
      method: "POST",
      url: "/api/v1/settings",
      headers: patient,
      payload: baseSettingsPayload(),
    });
    expect(settingsResponse.statusCode).toBe(201);

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload({ carbohydrateGrams: String(carb.carbohydrateGrams) }),
    });
    expect(previewResponse.statusCode).toBe(200);
    const preview = previewResponse.json();
    expect(preview.status).toBe("CALCULATED");
    expect(preview.confirmationRequired).toBe(true);

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patient,
      payload: { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash },
    });
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().state).toBe("USER_CONFIRMED");

    const historyResponse = await app.inject({ method: "GET", url: "/api/v1/history", headers: patient });
    expect(historyResponse.statusCode).toBe(200);
    const history = historyResponse.json();
    expect(history.events).toHaveLength(1);
    expect(history.events[0].calculationId).toBe(preview.calculationId);
    expect(history.events[0].state).toBe("USER_CONFIRMED");
  });
});
