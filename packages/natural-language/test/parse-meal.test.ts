import { describe, expect, it } from "vitest";
import { findItem, parseMeal, validateParsedMeal } from "../src/parse-meal.js";
import { extractFoods } from "../src/extract-foods.js";
import { segmentEvent } from "../src/segment-event.js";

const GOLDEN =
  "two bananas and two slices of white bread with 50 grams of butter";
const GOLDEN_SANDWICH =
  "I'm making a sandwich of two bananas and two slices of white bread with 50 grams of butter";

function names(text: string) {
  return parseMeal(text).items.map((item) => item.foodName);
}

describe("golden acceptance: banana / white bread / butter", () => {
  it("decomposes the exact meal sentence into three foods with bound quantities", () => {
    const parsed = parseMeal(GOLDEN);

    expect(parsed.items.length).toBe(3);
    expect(parsed.unresolvedFragments.length).toBe(0);
    expect(parsed.completeness.valid).toBe(true);

    const banana = findItem(parsed, (name) => name.includes("banana"));
    const whiteBread = findItem(parsed, (name) => name.includes("bread"));
    const butter = findItem(parsed, (name) => name.includes("butter"));

    expect(banana?.quantity).toBe(2);
    expect(banana?.unit).toBe("whole");
    expect(whiteBread?.quantity).toBe(2);
    expect(whiteBread?.unit).toBe("slice");
    expect(butter?.quantity).toBe(50);
    expect(butter?.unit).toBe("g");
  });

  it("does not treat the sandwich-of sentence as one food or stop at banana", () => {
    const parsed = parseMeal(GOLDEN_SANDWICH);
    expect(parsed.items.length).toBe(3);
    expect(parsed.containerContext).toBe("sandwich");
    expect(findItem(parsed, (name) => name.includes("banana"))?.quantity).toBe(2);
    expect(findItem(parsed, (name) => name.includes("bread"))?.quantity).toBe(2);
    expect(findItem(parsed, (name) => name.includes("butter"))?.quantity).toBe(50);
    expect(findItem(parsed, (name) => name.includes("butter"))?.unit).toBe("g");
  });

  it("does not attach 50 grams to the bread", () => {
    const parsed = parseMeal(GOLDEN);
    const whiteBread = findItem(parsed, (name) => name.includes("bread"));
    expect(whiteBread?.quantity).toBe(2);
    expect(whiteBread?.unit).toBe("slice");
    expect(whiteBread?.grams).not.toBe(50);
  });
});

describe("adversarial regression tests", () => {
  it('parses "2 bananas"', () => {
    const banana = findItem(parseMeal("2 bananas"), (name) => name.includes("banana"));
    expect(banana?.quantity).toBe(2);
    expect(banana?.unit).toBe("whole");
  });

  it('parses "two bananas"', () => {
    const banana = findItem(parseMeal("two bananas"), (name) => name.includes("banana"));
    expect(banana?.quantity).toBe(2);
  });

  it("parses bananas and white bread without dropping bread", () => {
    const parsed = parseMeal("two bananas and two slices of white bread");
    expect(parsed.items.length).toBe(2);
    expect(findItem(parsed, (name) => name.includes("banana"))?.quantity).toBe(2);
    expect(findItem(parsed, (name) => name.includes("bread"))?.quantity).toBe(2);
    expect(findItem(parsed, (name) => name.includes("bread"))?.unit).toBe("slice");
  });

  it("parses 50g butter attached to butter", () => {
    const parsed = parseMeal("two bananas and two slices of white bread with 50g butter");
    expect(parsed.items.length).toBe(3);
    expect(findItem(parsed, (name) => name.includes("butter"))?.quantity).toBe(50);
    expect(findItem(parsed, (name) => name.includes("butter"))?.unit).toBe("g");
  });

  it("keeps jam with a missing quantity rather than dropping it", () => {
    const parsed = parseMeal("2 slices of toast with 20 grams of butter and jam");
    expect(findItem(parsed, (name) => name.includes("toast"))?.quantity).toBe(2);
    expect(findItem(parsed, (name) => name.includes("toast"))?.unit).toBe("slice");
    expect(findItem(parsed, (name) => name.includes("butter"))?.quantity).toBe(20);
    expect(findItem(parsed, (name) => name.includes("jam"))).toBeDefined();
    expect(findItem(parsed, (name) => name.includes("jam"))?.quantity).toBeNull();
  });

  it("keeps coffee and milk, with milk quantity unresolved", () => {
    const parsed = parseMeal("coffee with milk");
    expect(findItem(parsed, (name) => name.includes("coffee"))).toBeDefined();
    expect(findItem(parsed, (name) => name.includes("milk"))).toBeDefined();
    expect(findItem(parsed, (name) => name.includes("milk"))?.quantity).toBeNull();
  });

  it("parses a large flat white and a banana", () => {
    const parsed = parseMeal("large flat white and a banana");
    const coffee = findItem(parsed, (name) => name.includes("flat white"));
    const banana = findItem(parsed, (name) => name.includes("banana"));
    expect(coffee?.quantity).toBe(1);
    expect(coffee?.modifiers).toContain("large");
    expect(banana?.quantity).toBe(1);
  });

  it("parses weet-bix, milk volume, and banana", () => {
    const parsed = parseMeal("2 weet-bix with 200ml full cream milk and a banana");
    expect(findItem(parsed, (name) => name.includes("weet-bix"))?.quantity).toBe(2);
    const milk = findItem(parsed, (name) => name.includes("milk"));
    expect(milk?.quantity).toBe(200);
    expect(milk?.unit).toBe("ml");
    expect(milk?.foodName).toMatch(/full cream milk/);
    expect(findItem(parsed, (name) => name.includes("banana"))?.quantity).toBe(1);
  });

  it("treats ham cheese tomato and mayo sandwich as a composite with uncertainty", () => {
    const parsed = parseMeal("ham cheese tomato and mayo sandwich");
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0]?.foodName).toBe("sandwich");
    expect(parsed.items[0]?.modifiers.length).toBeGreaterThanOrEqual(3);
    expect(parsed.items[0]?.assumptions.some((assumption) => /ingredient amounts unknown/i.test(assumption))).toBe(true);
    const extraction = extractFoods("ham cheese tomato and mayo sandwich");
    expect(extraction?.components[0]?.matchStatus).toBe("requires_review");
  });

  it("retains sandwich, chips, and coke", () => {
    const parsed = parseMeal("a chicken salad sandwich, packet of chips and a coke");
    expect(names("a chicken salad sandwich, packet of chips and a coke")).toEqual(
      expect.arrayContaining(["chicken salad sandwich", "chips", "coke"]),
    );
    expect(parsed.items.length).toBe(3);
  });

  it("parses half a banana with a tablespoon of peanut butter", () => {
    const parsed = parseMeal("half a banana with a tablespoon of peanut butter");
    expect(findItem(parsed, (name) => name.includes("banana"))?.quantity).toBe(0.5);
    const peanut = findItem(parsed, (name) => name.includes("peanut"));
    expect(peanut?.quantity).toBe(1);
    expect(peanut?.unit).toBe("tablespoon");
  });

  it("identifies bare toast and leaves quantity to be confirmed", () => {
    const parsed = parseMeal("toast");
    expect(findItem(parsed, (name) => name.includes("toast"))).toBeDefined();
    expect(findItem(parsed, (name) => name.includes("toast"))?.quantity).toBeNull();
  });
});

describe("language variation must not silently drop ingredients", () => {
  const messy = [
    "2 nana's 2 white toast 50g butter",
    "banana sandwich 2 bananas 2 bread lots of butter",
    "had two bits white toast banana and butter",
    "2 x banana, 2 x white bread, butter 50gm",
  ];

  for (const text of messy) {
    it(`keeps banana, bread/toast, and butter for: ${text}`, () => {
      const parsed = parseMeal(text);
      const joined = parsed.items.map((item) => `${item.foodName} ${item.originalFragment}`).join(" ");
      expect(joined).toMatch(/banana|nana/);
      expect(joined).toMatch(/bread|toast/);
      expect(joined).toMatch(/butter/);
    });
  }
});

describe("schema validation never trusts malformed model output", () => {
  it("rejects a non-object", () => {
    expect(validateParsedMeal("banana", GOLDEN)).toBeNull();
  });

  it("rejects items without a food name", () => {
    expect(validateParsedMeal({ items: [{ quantity: 2 }] }, GOLDEN)).toBeNull();
  });

  it("accepts a well-formed overlay and marks the source as llm", () => {
    const parsed = validateParsedMeal(
      {
        items: [
          { foodName: "banana", quantity: 2, unit: "whole", confidence: 0.98 },
          { foodName: "white bread", quantity: 2, unit: "slice", confidence: 0.98 },
          { foodName: "butter", quantity: 50, unit: "g", confidence: 0.99 },
        ],
      },
      GOLDEN,
    );
    expect(parsed?.parseSource).toBe("llm");
    expect(parsed?.items).toHaveLength(3);
  });
});

describe("segmentEvent uses the meal AST rather than whole-sentence search", () => {
  it("exposes the inspectable parse independently of nutrition", () => {
    const event = segmentEvent(GOLDEN_SANDWICH, Date.parse("2026-07-25T20:00:00.000Z"));
    expect(event.meal?.parsedMeal.items).toHaveLength(3);
    expect(event.mealPipeline?.parseSource).toBe("deterministic");
    expect(event.meal?.components.map((component) => component.phrase)).toEqual(["banana", "white bread", "butter"]);
  });
});
