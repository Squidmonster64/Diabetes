import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupOnlineFood } from "../src/food/onlineLookup.js";
import { validateCustomFoodInput } from "../src/customFoods/validation.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("online food lookup", () => {
  it("returns a review-only, source-attributed candidate from a bounded provider response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          {
            code: "1234567890123",
            product_name: "Example oat bar",
            brands: "Example Foods",
            serving_size: "1 bar (40 g)",
            nutriments: { carbohydrates_100g: 55, carbohydrates_serving: 22 },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOnlineFood("example oat bar");

    expect(result.unavailable).toBe(false);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        provider: "OPEN_FOOD_FACTS",
        productCode: "1234567890123",
        name: "Example oat bar",
        brand: "Example Foods",
        servingGrams: 40,
        carbohydratePerServingGrams: 22,
        carbohydratePer100gGrams: 55,
        sourceReliability: "COMMUNITY_CONTRIBUTED",
        sourceUrl: "https://world.openfoodfacts.org/product/1234567890123",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns an unavailable state instead of inventing a match when the provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(lookupOnlineFood("unknown item")).resolves.toEqual({ candidates: [], unavailable: true });
  });
});

describe("online-confirmed custom-food validation", () => {
  it("requires immutable lookup provenance before an online value can be saved", () => {
    expect(() => validateCustomFoodInput({
      foodType: "ONLINE_CONFIRMED",
      name: "Example oat bar",
      carbohydratePer100gGrams: 55,
    })).toThrow("require a source name, source reference, and valid retrieval time");
  });

  it("preserves valid online lookup provenance with the confirmed carbohydrate value", () => {
    expect(validateCustomFoodInput({
      foodType: "ONLINE_CONFIRMED",
      name: "Example oat bar",
      servingGrams: 40,
      carbohydratePerServingGrams: 22,
      sourceName: "Open Food Facts (community-contributed)",
      sourceReference: "https://world.openfoodfacts.org/product/1234567890123",
      sourceRetrievedAt: "2026-08-19T00:00:00.000Z",
    })).toMatchObject({
      foodType: "ONLINE_CONFIRMED",
      carbohydratePer100gGrams: "55",
      sourceName: "Open Food Facts (community-contributed)",
    });
  });
});
