import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestServer, devAuthHeader } from "./helpers.js";
import { emptyPanel } from "@diabetes-companion/food-engine";

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await makeTestServer());
});

afterAll(async () => {
  await app.close();
});

const auth = devAuthHeader("nutrition-beta");

describe("nutrition tracker interpret + log + aggregate", () => {
  it("decomposes banana, white bread and butter and includes all three in nutrition totals", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/nutrition/interpret",
      headers: auth,
      payload: {
        text: "two bananas and two slices of white bread with 50 grams of butter",
        sourceType: "text",
        timezone: "Australia/Sydney",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.parsedMeal.items.length).toBe(3);
    const names = body.items.map((item: { identity: { foodName: string } }) => item.identity.foodName.toLowerCase());
    expect(names.some((name: string) => name.includes("banana"))).toBe(true);
    expect(names.some((name: string) => name.includes("bread"))).toBe(true);
    expect(names.some((name: string) => name.includes("butter"))).toBe(true);
    const resolved = body.items.filter((item: { matchStatus: string }) => item.matchStatus === "resolved");
    expect(resolved.length).toBeGreaterThanOrEqual(3);
    const contributing = resolved.filter((item: { nutrients: { energyKcal: number | null } }) => item.nutrients.energyKcal && item.nutrients.energyKcal > 0);
    expect(contributing.length).toBeGreaterThanOrEqual(3);
    const energy = contributing.reduce((sum: number, item: { nutrients: { energyKcal: number } }) => sum + item.nutrients.energyKcal, 0);
    expect(body.totals.energyKcal).toBeCloseTo(energy, 0);
    expect(body.unresolved.filter((row: string) => /banana|bread|butter/i.test(row)).length).toBe(0);
  });

  it("parses the voice Weet-Bix golden sentence without dropping ingredients", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/nutrition/interpret",
      headers: auth,
      payload: {
        text: "two weet bix with two hundred mil full cream milk and a banana",
        sourceType: "voice",
        timezone: "Australia/Sydney",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const parsedNames = body.parsedMeal.items.map((item: { foodName: string }) => item.foodName.toLowerCase());
    expect(parsedNames.some((name: string) => name.includes("weet"))).toBe(true);
    expect(parsedNames.some((name: string) => name.includes("milk"))).toBe(true);
    expect(parsedNames.some((name: string) => name.includes("banana"))).toBe(true);
    expect(body.parsedMeal.items.length).toBeGreaterThanOrEqual(3);
    const milk = body.parsedMeal.items.find((item: { foodName: string }) => /milk/i.test(item.foodName));
    expect(milk.quantity).toBe(200);
    expect(milk.unit).toBe("ml");
  });

  it("sums three meals into the daily total without LLM arithmetic", async () => {
    const date = "2026-08-20";
    const logged = [];
    for (const [index, protein] of [10, 20, 30].entries()) {
      const payload = {
        originalText: `meal ${index}`,
        mealType: "lunch",
        timezone: "UTC",
          loggedAt: `${date}T${String(index + 8).padStart(2, "0")}:00:00.000Z`,
        confirmDuplicate: true,
        items: [
          {
            id: `item-${index}`,
            originalFragment: "food",
            identity: {
              foodId: `food-${index}`,
              foodName: `Food ${index}`,
              brand: null,
              sourceDataset: "AUSNUT_2023",
              sourceFoodId: "x",
              customFoodId: null,
              savedMealId: null,
              recipeId: null,
              source: "AUSNUT",
            },
            serving: { servingId: null, servingLabel: null, quantity: 1, unit: "g", grams: 100, millilitres: null },
            nutrients: { ...emptyPanel(), proteinG: protein, carbohydrateG: protein, fatG: protein, sodiumMg: protein * 10 },
            assumptions: [],
            matchConfidence: 1,
            matchStatus: "resolved",
            databaseSha256: "abc",
            sourceVersion: "test",
          },
        ],
      };
      const response = await app.inject({ method: "POST", url: "/api/v1/nutrition/meals", headers: auth, payload });
      if (response.statusCode !== 200) {
        throw new Error(`meal log failed ${response.statusCode}: ${response.body}`);
      }
      logged.push(response.json());
    }
    const day = await app.inject({ method: "GET", url: `/api/v1/nutrition/days/${date}`, headers: auth });
    expect(day.statusCode).toBe(200);
    const body = day.json();
    expect(body.totals.proteinG).toBe(60);
    expect(body.totals.carbohydrateG).toBe(60);
    expect(body.totals.fatG).toBe(60);
    expect(body.totals.sodiumMg).toBe(600);
    expect(body.meals).toHaveLength(3);
    void logged;
  });

  it("keeps a stored nutrient snapshot when a later log uses different values", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/nutrition/meals",
      headers: auth,
      payload: {
        originalText: "snapshot food",
        timezone: "UTC",
        loggedAt: "2026-08-21T08:00:00.000Z",
        confirmDuplicate: true,
        items: [
          {
            id: "snap-1",
            originalFragment: "banana",
            identity: {
              foodId: "banana",
              foodName: "Banana",
              brand: null,
              sourceDataset: "AUSNUT_2023",
              sourceFoodId: "16502001",
              customFoodId: null,
              savedMealId: null,
              recipeId: null,
              source: "AUSNUT",
            },
            serving: { servingId: "m", servingLabel: "medium", quantity: 1, unit: "whole", grams: 127, millilitres: null },
            nutrients: { ...emptyPanel(), proteinG: 1.2, energyKcal: 99 },
            assumptions: ["assumed medium"],
            matchConfidence: 1,
            matchStatus: "resolved",
            databaseSha256: "old-db",
            sourceVersion: "v1",
          },
        ],
      },
    });
    expect(first.statusCode).toBe(200);
    const mealId = first.json().id;
    const fetched = await app.inject({ method: "GET", url: `/api/v1/nutrition/meals/${mealId}`, headers: auth });
    expect(fetched.json().items[0].nutrients.proteinG).toBe(1.2);
    expect(fetched.json().items[0].nutrients.energyKcal).toBe(99);
    expect(fetched.json().items[0].databaseSha256).toBe("old-db");
  });

  it("marks incomplete days in weekly coverage instead of treating them as full days", async () => {
    const patient = devAuthHeader("nutrition-week");
    for (let day = 1; day <= 7; day += 1) {
      const date = `2026-07-0${day}`;
      await app.inject({
        method: "POST",
        url: "/api/v1/nutrition/meals",
        headers: patient,
        payload: {
          originalText: `day ${day}`,
          timezone: "UTC",
          loggedAt: `${date}T12:00:00.000Z`,
          confirmDuplicate: true,
          items: [
            {
              id: `w-${day}`,
              originalFragment: "food",
              identity: {
                foodId: "f",
                foodName: "Food",
                brand: null,
                sourceDataset: "AUSNUT_2023",
                sourceFoodId: "x",
                customFoodId: null,
                savedMealId: null,
                recipeId: null,
                source: "AUSNUT",
              },
              serving: { servingId: null, servingLabel: null, quantity: 1, unit: "g", grams: 100, millilitres: null },
              nutrients: { ...emptyPanel(), proteinG: 70 },
              assumptions: [],
              matchConfidence: 1,
              matchStatus: "resolved",
              databaseSha256: "abc",
              sourceVersion: "test",
            },
          ],
        },
      });
      await app.inject({
        method: "PUT",
        url: `/api/v1/nutrition/days/${date}/completeness`,
        headers: patient,
        payload: { completeness: day === 1 ? "partial" : "complete" },
      });
    }
    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/nutrition/summary?range=all&timezone=UTC",
      headers: patient,
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json();
    expect(body.coverage.loggedDays).toBe(7);
    expect(body.coverage.completeDays).toBe(6);
    expect(body.coverage.partialDays).toBe(1);
    expect(body.coverage.note).toMatch(/complete/i);
    expect(body.averages.onCompleteDays.proteinG).toBe(70);
  });

  it("isolates one user's meals from another", async () => {
    const a = devAuthHeader("nutrition-a");
    const b = devAuthHeader("nutrition-b");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/nutrition/meals",
      headers: a,
      payload: {
        originalText: "secret meal",
        timezone: "UTC",
        loggedAt: "2026-08-22T12:00:00.000Z",
        confirmDuplicate: true,
        items: [
          {
            id: "iso",
            originalFragment: "x",
            identity: {
              foodId: "x",
              foodName: "X",
              brand: null,
              sourceDataset: "AUSNUT_2023",
              sourceFoodId: "x",
              customFoodId: null,
              savedMealId: null,
              recipeId: null,
              source: "AUSNUT",
            },
            serving: { servingId: null, servingLabel: null, quantity: 1, unit: "g", grams: 10, millilitres: null },
            nutrients: { ...emptyPanel(), proteinG: 1 },
            assumptions: [],
            matchConfidence: 1,
            matchStatus: "resolved",
            databaseSha256: "abc",
            sourceVersion: "test",
          },
        ],
      },
    });
    const id = created.json().id;
    const cross = await app.inject({ method: "GET", url: `/api/v1/nutrition/meals/${id}`, headers: b });
    expect(cross.statusCode).toBe(404);
  });

  it("warns on an immediate duplicate log", async () => {
    const patient = devAuthHeader("nutrition-dup");
    const payload = {
      originalText: "two bananas",
      timezone: "UTC",
      items: [
        {
          id: "d1",
          originalFragment: "banana",
          identity: {
            foodId: "b",
            foodName: "Banana",
            brand: null,
            sourceDataset: "AUSNUT_2023",
            sourceFoodId: "x",
            customFoodId: null,
            savedMealId: null,
            recipeId: null,
            source: "AUSNUT",
          },
          serving: { servingId: null, servingLabel: null, quantity: 2, unit: "whole", grams: 250, millilitres: null },
          nutrients: { ...emptyPanel(), proteinG: 2 },
          assumptions: [],
          matchConfidence: 1,
          matchStatus: "resolved",
          databaseSha256: "abc",
          sourceVersion: "test",
        },
      ],
    };
    const first = await app.inject({ method: "POST", url: "/api/v1/nutrition/meals", headers: patient, payload });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: "/api/v1/nutrition/meals", headers: patient, payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("DUPLICATE_MEAL");
  });

  it("works without targets and does not invent them", async () => {
    const day = await app.inject({ method: "GET", url: "/api/v1/nutrition/days/2026-08-20", headers: auth });
    expect(day.json().targets).toBeNull();
    const targets = await app.inject({ method: "GET", url: "/api/v1/nutrition/targets", headers: auth });
    expect(targets.json().targets).toBeNull();
  });
});
