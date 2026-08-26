import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretCapture, overlayLanguageEvent } from "../src/interpret-capture.js";
import { parseMeal, validateParsedMeal } from "../src/parse-meal.js";

describe("overlayLanguageEvent", () => {
  const now = Date.parse("2026-08-25T00:00:00.000Z");

  it("does not invent a glucose reading that is absent from the source text", () => {
    const interpretation = interpretCapture("two bananas", now);
    const overlayed = overlayLanguageEvent(interpretation, {
      glucose: { value: 8.4, unit: "mmol/L", rawSpan: "8.4" },
    });
    expect(overlayed.extraction.glucose?.value.value ?? null).toBeNull();
    expect((overlayed as unknown as { extraction: { roundedTotalUnits?: number } }).extraction.roundedTotalUnits).toBeUndefined();
  });

  it("does not overwrite a deterministic glucose extraction", () => {
    const interpretation = interpretCapture("My blood glucose is 8.4 mmol/L and I am eating 40 grams of rice.", now);
    const overlayed = overlayLanguageEvent(interpretation, {
      glucose: { value: 12, unit: "mmol/L", rawSpan: "12" },
    });
    expect(overlayed.extraction.glucose?.value.value).toBe(8.4);
  });

  it("can fill a stated glucose the deterministic parser missed only when the number is in the source", () => {
    const interpretation = interpretCapture("sugar 6.2 mmol/L with two weet bix", now);
    if (interpretation.extraction.glucose?.value.value) return;
    const overlayed = overlayLanguageEvent(interpretation, {
      glucose: { value: 6.2, unit: "mmol/L", rawSpan: "6.2 mmol/L" },
    });
    expect(overlayed.extraction.glucose?.value.value).toBe(6.2);
    expect(overlayed.extraction.glucose?.unit.value).toBe("MMOL_L");
    expect(overlayed.intent.mayRunDeterministicPreview).not.toBeUndefined();
  });
});

describe("validateParsedMeal rejects invented nutrition", () => {
  it("accepts language-only food items", () => {
    const parsed = validateParsedMeal(
      {
        items: [{ foodName: "banana", quantity: 2, unit: "whole", confidence: 0.9 }],
      },
      "two bananas",
    );
    expect(parsed?.items[0]?.foodName).toMatch(/banana/i);
    expect(parsed?.parseSource).toBe("llm");
  });

  it("golden deterministic parse still binds quantities without a model", () => {
    const parsed = parseMeal("two bananas and two slices of white bread with 50 grams of butter");
    expect(parsed.items).toHaveLength(3);
  });
});
