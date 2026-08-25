import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { searchFoods } from "../src/food/search.js";
import { getMeasures } from "../src/food/measures.js";
import { calculateNutrition } from "../src/food/nutrition.js";
import { calculateCarbohydrate } from "../src/food/calculate.js";

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

describe("calculateNutrition", () => {
  it("returns a full macro panel for a gram quantity and keeps unknown distinct from zero", () => {
    const search = searchFoods(db, { query: "Weet-Bix" });
    const weetbix = search.results[0]!;
    const result = calculateNutrition(
      db,
      { kind: "GRAMS", sourceDataset: weetbix.sourceDataset, sourceFoodId: weetbix.sourceFoodId, grams: 30 },
      FAKE_SHA,
    );
    expect(result.nutrients.carbohydrateG).toBeGreaterThan(0);
    expect(result.nutrients.proteinG).toBeGreaterThan(0);
    expect(result.nutrients.energyKcal).toBeGreaterThan(0);
    expect(result.portionGrams).toBe(30);
    const doubled = calculateNutrition(
      db,
      { kind: "GRAMS", sourceDataset: weetbix.sourceDataset, sourceFoodId: weetbix.sourceFoodId, grams: 60 },
      FAKE_SHA,
    );
    expect(doubled.nutrients.proteinG).toBeCloseTo((result.nutrients.proteinG ?? 0) * 2, 0);
  });

  it("uses the medium banana household measure rather than the density coefficient", () => {
    const search = searchFoods(db, { query: "Banana, cavendish" });
    const banana = search.results[0]!;
    const measures = getMeasures(db, banana.sourceDataset, banana.sourceFoodId);
    const medium = measures.find((measure) => /medium/i.test(measure.measureDescription));
    expect(medium).toBeDefined();
    const result = calculateNutrition(
      db,
      {
        kind: "MEASURE",
        sourceDataset: banana.sourceDataset,
        sourceFoodId: banana.sourceFoodId,
        measureId: medium!.measureId,
        measureMultiplier: 2,
      },
      FAKE_SHA,
    );
    expect(result.portionGrams).toBeGreaterThan(100);
    expect(result.nutrients.carbohydrateG).toBeGreaterThan(0);
    expect(result.nutrients.energyKcal).toBeGreaterThan(0);
  });

  it("does not rewrite carbohydrate-only calculation used by the diabetes app", () => {
    const search = searchFoods(db, { query: "Weet-Bix" });
    const food = search.results[0]!;
    const carbs = calculateCarbohydrate(
      db,
      { kind: "GRAMS", sourceDataset: food.sourceDataset, sourceFoodId: food.sourceFoodId, grams: 30 },
      FAKE_SHA,
    );
    const nutrition = calculateNutrition(
      db,
      { kind: "GRAMS", sourceDataset: food.sourceDataset, sourceFoodId: food.sourceFoodId, grams: 30 },
      FAKE_SHA,
    );
    expect(nutrition.nutrients.carbohydrateG).toBe(carbs.carbohydrateGrams);
  });
});
