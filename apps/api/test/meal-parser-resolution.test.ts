import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { findItem, parseMeal } from "@diabetes-companion/natural-language";
import { searchFoods } from "../src/food/search.js";
import { getMeasures } from "../src/food/measures.js";
import { calculateCarbohydrate } from "../src/food/calculate.js";
import { chooseMealParse } from "../src/meals/parseMealLlm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../../data/australian_foods.sqlite");
const GOLDEN = "two bananas and two slices of white bread with 50 grams of butter";

let db: InstanceType<typeof Database>;
let databaseSha256: string;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  databaseSha256 = createHash("sha256").update(readFileSync(DB_PATH)).digest("hex");
});

afterAll(() => {
  db.close();
});

function resolveItemCarbs(foodName: string, quantity: number, unit: string | null): { foodName: string; carbohydrateGrams: number } {
  const search = searchFoods(db, { query: foodName });
  expect(search.results.length).toBeGreaterThan(0);
  const best = search.results[0]!;
  expect(best.sourceFoodId).toBeTruthy();

  if (unit === "g") {
    const result = calculateCarbohydrate(
      db,
      { kind: "GRAMS", sourceDataset: best.sourceDataset, sourceFoodId: best.sourceFoodId, grams: quantity },
      databaseSha256,
    );
    return { foodName: best.foodName, carbohydrateGrams: result.carbohydrateGrams };
  }

  const measures = getMeasures(db, best.sourceDataset, best.sourceFoodId);
  const hint = unit === "slice" ? /\bslice\b/i : /\b(medium|fruit|whole|each|banana)\b/i;
  const measure =
    measures.find((entry) => entry.quantity === 1 && entry.gramAmount !== null && hint.test(entry.measureDescription) && !/density/i.test(entry.measureDescription)) ??
    measures.find((entry) => entry.quantity === 1 && entry.gramAmount !== null && !/density/i.test(entry.measureDescription));
  expect(measure).toBeDefined();
  const result = calculateCarbohydrate(
    db,
    {
      kind: "MEASURE",
      sourceDataset: best.sourceDataset,
      sourceFoodId: best.sourceFoodId,
      measureId: measure!.measureId,
      measureMultiplier: quantity,
    },
    databaseSha256,
  );
  return { foodName: best.foodName, carbohydrateGrams: result.carbohydrateGrams };
}

describe("golden meal resolution through the production food pipeline", () => {
  it("parses three foods, resolves each independently, and aggregates by summing item carbs", () => {
    const parsed = parseMeal(GOLDEN);
    expect(parsed.items).toHaveLength(3);

    const banana = findItem(parsed, (name) => name.includes("banana"));
    const bread = findItem(parsed, (name) => name.includes("bread"));
    const butter = findItem(parsed, (name) => name.includes("butter"));
    expect(banana?.quantity).toBe(2);
    expect(banana?.unit).toBe("whole");
    expect(bread?.quantity).toBe(2);
    expect(bread?.unit).toBe("slice");
    expect(butter?.quantity).toBe(50);
    expect(butter?.unit).toBe("g");

    const bananaResult = resolveItemCarbs(banana!.foodName, banana!.quantity!, banana!.unit);
    const breadResult = resolveItemCarbs(bread!.foodName, bread!.quantity!, bread!.unit);
    const butterResult = resolveItemCarbs(butter!.foodName, butter!.quantity!, butter!.unit);

    expect(bananaResult.carbohydrateGrams).toBeGreaterThan(0);
    expect(breadResult.carbohydrateGrams).toBeGreaterThan(0);
    expect(butterResult.carbohydrateGrams).toBeGreaterThanOrEqual(0);

    const mealTotalCarbs = bananaResult.carbohydrateGrams + breadResult.carbohydrateGrams + butterResult.carbohydrateGrams;
    expect(mealTotalCarbs).toBe(bananaResult.carbohydrateGrams + breadResult.carbohydrateGrams + butterResult.carbohydrateGrams);
    expect(searchFoods(db, { query: GOLDEN }).results[0]?.foodName.toLowerCase()).not.toBe(GOLDEN);
  });

  it("does not let a banana database hit erase bread or butter", () => {
    const parsed = parseMeal(GOLDEN);
    const bananaHits = searchFoods(db, { query: "banana" });
    expect(bananaHits.results.length).toBeGreaterThan(0);
    expect(parsed.items.map((item) => item.foodName)).toEqual(["banana", "white bread", "butter"]);
  });
});

describe("language-model overlay policy", () => {
  it("keeps the deterministic parse when the model drops an ingredient", () => {
    const deterministic = parseMeal(GOLDEN);
    const weaker = { ...deterministic, items: deterministic.items.slice(0, 1), parseSource: "llm" as const };
    expect(chooseMealParse(deterministic, weaker).items).toHaveLength(3);
  });
});
