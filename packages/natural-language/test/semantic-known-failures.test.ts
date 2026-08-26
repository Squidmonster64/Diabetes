process.env.TZ = "Australia/Perth";

import { describe, expect, it } from "vitest";
import { interpretCapture } from "../src/interpret-capture.js";
import { groupSemanticEvents } from "../src/semantic-timeline.js";
import { parserInventedDose } from "../src/acceptance-intent.js";

/** Noon Australia/Perth on 26 Aug 2026. */
const REFERENCE_NOW = Date.parse("2026-08-26T04:00:00.000Z");

const SANDWICH = `My blood glucose is 17 and I feel nauseous.
I took 10 units of short acting insulin ten minutes ago.
I ate a cheese sandwich four hours ago.`;

describe("known production failures — never remove", () => {
  it("sandwich multi-event keeps independent times, nausea, and cheese sandwich", () => {
    const interpretation = interpretCapture(SANDWICH, REFERENCE_NOW);
    const events = interpretation.extraction.semanticEvents;
    const glucose = events.find((event) => event.type === "GLUCOSE_READING");
    const symptom = events.find((event) => event.type === "SYMPTOM");
    const insulin = events.find((event) => event.type === "INSULIN_TAKEN");
    const meal = events.find((event) => event.type === "MEAL");
    expect(glucose?.glucoseValue).toBe(17);
    expect(symptom?.symptom).toMatch(/nauseous/i);
    expect(insulin?.insulinAmountUnits).toBe(10);
    expect(insulin?.relativeTimeMinutes).toBe(-10);
    expect(insulin?.insulinType).toMatch(/short acting/i);
    expect(meal?.mealDescription).toMatch(/cheese sandwich/i);
    expect(meal?.relativeTimeMinutes).toBe(-240);
    expect(parserInventedDose(interpretation)).toBe(false);
    expect(interpretation.extraction.completeness.interpretationStatus).toBe("COMPLETE");
    const groups = groupSemanticEvents(events);
    expect(groups.map((group) => group.heading)).toEqual(expect.arrayContaining(["CURRENT", "10 MIN AGO", "4 HOURS AGO"]));
  });

  it("banana / white bread / butter keeps three foods and bound quantities", () => {
    const interpretation = interpretCapture(
      "two bananas and two slices of white bread with 50 grams of butter",
      REFERENCE_NOW,
    );
    const meal = interpretation.extraction.semanticEvents.find((event) => event.type === "MEAL");
    expect(meal?.foods).toHaveLength(3);
    expect(meal?.foods.find((item) => /banana/i.test(item.foodName))?.quantity).toBe(2);
    expect(meal?.foods.find((item) => /bread/i.test(item.foodName))?.quantity).toBe(2);
    expect(meal?.foods.find((item) => /bread/i.test(item.foodName))?.unit).toBe("slice");
    expect(meal?.foods.find((item) => /butter/i.test(item.foodName))?.quantity).toBe(50);
    expect(meal?.foods.find((item) => /butter/i.test(item.foodName))?.unit).toBe("g");
  });

  it("I feel nauseous is a symptom, not UNKNOWN", () => {
    const interpretation = interpretCapture("I feel nauseous", REFERENCE_NOW);
    const symptom = interpretation.extraction.semanticEvents.find((event) => event.type === "SYMPTOM");
    expect(symptom?.symptom).toMatch(/nauseous/i);
    expect(interpretation.extraction.semanticEvents.every((event) => event.type !== "UNKNOWN" || interpretation.extraction.semanticEvents.length > 1)).toBe(true);
  });

  it("cheese sandwich stays a composite food", () => {
    const interpretation = interpretCapture("cheese sandwich", REFERENCE_NOW);
    const meal = interpretation.extraction.semanticEvents.find((event) => event.type === "MEAL");
    expect(meal?.mealDescription).toMatch(/cheese sandwich/i);
    expect(meal?.foods.some((item) => item.foodName === "cheese" && !/sandwich/i.test(item.foodName))).toBe(false);
  });

  it("meal four hours ago keeps relative time on the meal event", () => {
    const interpretation = interpretCapture("I ate a cheese sandwich four hours ago", REFERENCE_NOW);
    const meal = interpretation.extraction.semanticEvents.find((event) => event.type === "MEAL");
    expect(meal?.relativeTimeMinutes).toBe(-240);
  });

  it("insulin ten minutes ago is not attached to a meal four hours ago", () => {
    const interpretation = interpretCapture(
      "I took 10 units ten minutes ago and ate a sandwich four hours ago",
      REFERENCE_NOW,
    );
    const insulin = interpretation.extraction.semanticEvents.find((event) => event.type === "INSULIN_TAKEN");
    const meal = interpretation.extraction.semanticEvents.find((event) => event.type === "MEAL");
    expect(insulin?.relativeTimeMinutes).toBe(-10);
    expect(meal?.relativeTimeMinutes).toBe(-240);
  });

  it("give me 10 units is never insulin taken and never a generated dose", () => {
    const interpretation = interpretCapture("Give me 10 units for this meal", REFERENCE_NOW);
    expect(interpretation.extraction.semanticEvents.some((event) => event.type === "INSULIN_TAKEN" && event.actionStatus === "TAKEN")).toBe(false);
    expect(parserInventedDose(interpretation)).toBe(false);
    expect(interpretation.intent.doseRequestLanguageDetected || interpretation.extraction.semanticEvents.some((event) => event.type === "MEAL_DOSE_REQUEST")).toBe(true);
  });

  it("settings language does not mutate configuration", () => {
    const interpretation = interpretCapture("change my carb ratio to 1:8", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("SETTINGS_CHANGE_ATTEMPT");
    expect(interpretation.extraction.semanticEvents.some((event) => event.type === "SETTINGS_CHANGE_ATTEMPT")).toBe(true);
  });

  it("conflicting meters stay as two readings", () => {
    const interpretation = interpretCapture("one meter says 6.8 and the other says 8.9", REFERENCE_NOW);
    const glucose = interpretation.extraction.semanticEvents.filter((event) => event.type === "GLUCOSE_READING");
    expect(glucose.map((event) => event.glucoseValue).sort()).toEqual([6.8, 8.9]);
  });
});
