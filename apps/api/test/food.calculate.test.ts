import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { searchFoods } from "../src/food/search.js";
import { getMeasures } from "../src/food/measures.js";
import { calculateCarbohydrate } from "../src/food/calculate.js";
import { FoodModuleError } from "../src/food/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../../data/australian_foods.sqlite");
const FAKE_SHA = "deadbeef";

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
});

afterAll(() => {
  db.close();
});

describe("calculateCarbohydrate", () => {
  it("calculates Weet-Bix carbohydrate by grams (AFCD solid)", () => {
    const search = searchFoods(db, { query: "Weet-Bix" });
    const weetbix = search.results[0]!;
    const result = calculateCarbohydrate(
      db,
      { kind: "GRAMS", sourceDataset: weetbix.sourceDataset, sourceFoodId: weetbix.sourceFoodId, grams: 30 },
      FAKE_SHA,
    );
    expect(result.carbohydrateGrams).toBeGreaterThan(0);
    expect(result.portionGrams).toBe(30);
    expect(result.provenance.databaseSha256).toBe(FAKE_SHA);
    expect(result.carbohydrateDefinition).toBe("available_carbohydrate_without_sugar_alcohols");
  });

  it("calculates an AUSNUT household measure (apple)", () => {
    const search = searchFoods(db, { query: "granny smith" });
    const apple = search.results[0]!;
    const measures = getMeasures(db, apple.sourceDataset, apple.sourceFoodId);
    expect(measures.length).toBeGreaterThan(0);
    const measure = measures[0]!;
    const result = calculateCarbohydrate(
      db,
      {
        kind: "MEASURE",
        sourceDataset: apple.sourceDataset,
        sourceFoodId: apple.sourceFoodId,
        measureId: measure.measureId,
        measureMultiplier: 1,
      },
      FAKE_SHA,
    );
    expect(result.portionDescription).toBe(measure.measureDescription);
    expect(result.carbohydrateGrams).toBeGreaterThanOrEqual(0);
  });

  it("calculates an AFCD liquid by millilitres", () => {
    const search = searchFoods(db, { query: "stock, liquid", sourceDataset: "AFCD_RELEASE_3" });
    const liquid = search.results.find((r) => r.hasMillilitreData)!;
    expect(liquid).toBeDefined();
    const result = calculateCarbohydrate(
      db,
      { kind: "MILLILITRES", sourceDataset: "AFCD_RELEASE_3", sourceFoodId: liquid.sourceFoodId, millilitres: 250 },
      FAKE_SHA,
    );
    expect(result.portionMillilitres).toBe(250);
    expect(result.carbohydrateGrams).toBeGreaterThanOrEqual(0);
  });

  it("rejects zero quantity", () => {
    expect(() =>
      calculateCarbohydrate(db, { kind: "GRAMS", sourceDataset: "AUSNUT_2023", sourceFoodId: "16101004", grams: 0 }, FAKE_SHA),
    ).toThrow(FoodModuleError);
  });

  it("rejects negative quantity", () => {
    expect(() =>
      calculateCarbohydrate(db, { kind: "GRAMS", sourceDataset: "AUSNUT_2023", sourceFoodId: "16101004", grams: -50 }, FAKE_SHA),
    ).toThrow(FoodModuleError);
  });

  it("rejects an unreasonably large quantity", () => {
    expect(() =>
      calculateCarbohydrate(
        db,
        { kind: "GRAMS", sourceDataset: "AUSNUT_2023", sourceFoodId: "16101004", grams: 1_000_000 },
        FAKE_SHA,
      ),
    ).toThrow(FoodModuleError);
  });

  it("rejects an unknown food id", () => {
    expect(() =>
      calculateCarbohydrate(
        db,
        { kind: "GRAMS", sourceDataset: "AUSNUT_2023", sourceFoodId: "does-not-exist", grams: 100 },
        FAKE_SHA,
      ),
    ).toThrow(FoodModuleError);
  });

  it("rejects millilitre entry for an AUSNUT item", () => {
    expect(() =>
      calculateCarbohydrate(
        db,
        { kind: "MILLILITRES", sourceDataset: "AUSNUT_2023", sourceFoodId: "16101004", millilitres: 100 },
        FAKE_SHA,
      ),
    ).toThrow(FoodModuleError);
  });
});

describe("getMeasures", () => {
  it("returns an empty list for AFCD items (no household measures in this database)", () => {
    const measures = getMeasures(db, "AFCD_RELEASE_3", "F001845");
    expect(measures).toEqual([]);
  });
});
