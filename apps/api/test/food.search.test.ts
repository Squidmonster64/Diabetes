import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { searchFoods } from "../src/food/search.js";
import { FoodModuleError } from "../src/food/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../../data/australian_foods.sqlite");

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
});

afterAll(() => {
  db.close();
});

describe("searchFoods", () => {
  it("finds Weet-Bix", () => {
    const response = searchFoods(db, { query: "Weet-Bix" });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.some((result) => /weet-bix/i.test(result.foodName))).toBe(true);
  });

  it("ranks exact/whole-word apple matches above unrelated substring matches (apple/cider problem)", () => {
    const response = searchFoods(db, { query: "apple" });
    expect(response.results.length).toBeGreaterThan(0);
    const topResult = response.results[0]!;
    expect(topResult.foodName.toLowerCase().startsWith("apple")).toBe(true);
    expect(["EXACT", "PREFIX", "WHOLE_WORD"]).toContain(topResult.matchType);

    // Every returned item should rank at least as well as a pure substring match;
    // no SUBSTRING-only result should outrank a WHOLE_WORD/PREFIX/EXACT one.
    const rankOf: Record<string, number> = { EXACT: 0, PREFIX: 1, WHOLE_WORD: 2, TOKEN: 3, SUBSTRING: 4 };
    const ranks = response.results.map((result) => rankOf[result.matchType]);
    const sorted = [...ranks].sort((a, b) => (a as number) - (b as number));
    expect(ranks).toEqual(sorted);
  });

  it("returns AFCD solid foods", () => {
    const response = searchFoods(db, { query: "cardamom", sourceDataset: "AFCD_RELEASE_3" });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]!.sourceDataset).toBe("AFCD_RELEASE_3");
  });

  it("returns AFCD liquids", () => {
    const response = searchFoods(db, { query: "stock, liquid", sourceDataset: "AFCD_RELEASE_3" });
    expect(response.results.some((result) => result.hasMillilitreData)).toBe(true);
  });

  it("returns an AUSNUT item with household measures available", () => {
    const response = searchFoods(db, { query: "granny smith" });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]!.sourceDataset).toBe("AUSNUT_2023");
  });

  it("returns no results for a query that matches nothing", () => {
    const response = searchFoods(db, { query: "zzzznonexistentfoodqqq" });
    expect(response.results).toEqual([]);
    expect(response.totalMatches).toBe(0);
  });

  it("rejects a malformed (empty) query", () => {
    expect(() => searchFoods(db, { query: "   " })).toThrow(FoodModuleError);
  });

  it("rejects a query containing control characters", () => {
    const bellCharacter = String.fromCharCode(7);
    const withControlChar = ["apple", "pie"].join(bellCharacter);
    expect(() => searchFoods(db, { query: withControlChar })).toThrow(FoodModuleError);
  });

  it("rejects an overlong query", () => {
    expect(() => searchFoods(db, { query: "a".repeat(500) })).toThrow(FoodModuleError);
  });

  it("paginates results", () => {
    const pageOne = searchFoods(db, { query: "chicken", page: 1, pageSize: 5 });
    const pageTwo = searchFoods(db, { query: "chicken", page: 2, pageSize: 5 });
    expect(pageOne.results.length).toBeLessThanOrEqual(5);
    if (pageTwo.results.length > 0) {
      expect(pageOne.results[0]!.sourceFoodId).not.toBe(pageTwo.results[0]!.sourceFoodId);
    }
  });

  it("safely handles FTS special characters without throwing", () => {
    expect(() => searchFoods(db, { query: '"apple" OR NOT *' })).not.toThrow();
  });
});
