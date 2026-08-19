process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import { segmentEvent } from "../src/segment-event.js";
import { hasBlockingClarifications } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE_NOW = new Date("2026-07-25T20:00:00.000Z").getTime();

function run(text: string) {
  return segmentEvent(text, REFERENCE_NOW);
}

describe("acceptance test 1: full combined statement", () => {
  const event = run(
    "My blood glucose is 15. I took 4 units of insulin two hours ago and I am eating a ham sandwich with two slices of white bread and a little butter.",
  );

  it("extracts glucose value with a missing unit", () => {
    expect(event.glucose?.value.value).toBe(15);
    expect(event.glucose?.unit.status).toBe("missing");
    expect(event.glucose?.timestamp.status).toBe("provisional");
    expect(event.glucose?.timestamp.value).toBe(new Date(REFERENCE_NOW).toISOString());
  });

  it("extracts the prior insulin dose and its relative time", () => {
    expect(event.recentInsulin?.amountUnits.value).toBe(4);
    expect(event.recentInsulin?.amountUnits.status).toBe("provisional");
    expect(event.recentInsulin?.takenAt.rawSpan).toBe("two hours ago");
    expect(event.recentInsulin?.takenAt.value).toBe(new Date(REFERENCE_NOW - 2 * 3_600_000).toISOString());
  });

  it("segments the meal into ham, white bread, and butter", () => {
    const components = event.meal?.components ?? [];
    expect(components).toHaveLength(3);

    const ham = components.find((c) => c.phrase === "ham");
    expect(ham?.quantity.value).toBeNull();
    expect(ham?.matchStatus).toBe("provisional");
    expect(ham?.quantityNeededForCalculation).toBe(false);

    const bread = components.find((c) => c.phrase === "white bread");
    expect(bread?.quantity.value).toBe(2);
    expect(bread?.unit.value).toBe("slices");
    expect(bread?.matchStatus).toBe("provisional");

    const butter = components.find((c) => c.phrase === "butter");
    expect(butter?.quantity.value).toBeNull();
    expect(butter?.qualifier).toBe("a little");
    expect(butter?.matchStatus).toBe("requires_review");
  });

  it("asks for the glucose unit but not for insulin type or bread quantity", () => {
    expect(event.clarifications.some((c) => c.field === "glucose.unit")).toBe(true);
    expect(event.clarifications.some((c) => c.field.includes("insulinType"))).toBe(false);
    expect(event.clarifications.some((c) => c.field.includes("bread"))).toBe(false);
  });

  it("never calculates a bolus or carbohydrate total on the provisional event", () => {
    expect((event as unknown as Record<string, unknown>).bolusDose).toBeUndefined();
    expect((event as unknown as Record<string, unknown>).carbohydrateGrams).toBeUndefined();
  });
});

describe("acceptance test 2: missing insulin amount must not read 'units' as a number", () => {
  const event = run("I took units of insulin two hours ago.");

  it("reports the amount as missing, never as a guessed number", () => {
    expect(event.recentInsulin?.amountUnits.value).toBeNull();
    expect(event.recentInsulin?.amountUnits.status).toBe("missing");
  });

  it("asks the exact required clarification question", () => {
    const question = event.clarifications.find((c) => c.field === "recentInsulin.amountUnits");
    expect(question?.question).toBe("How many units of insulin did you take two hours ago?");
    expect(question?.blocking).toBe(true);
  });
});

describe("acceptance test 3: missing bread quantity blocks with the exact sandwich wording", () => {
  const event = run("I am eating a ham sandwich with white bread and a little butter.");

  it("marks the bread component as missing a quantity", () => {
    const bread = event.meal?.components.find((c) => c.phrase === "white bread");
    expect(bread?.matchStatus).toBe("missing");
    expect(bread?.quantity.value).toBeNull();
  });

  it("asks the exact required clarification question", () => {
    const question = event.clarifications.find((c) => c.field.startsWith("meal.components") && c.question.includes("bread"));
    expect(question?.question).toBe("How many slices of white bread are in the sandwich?");
    expect(question?.blocking).toBe(true);
  });
});

describe("acceptance test 4: alternate phrasing with a drink component", () => {
  const event = run("My glucose is 8.4 and I'm having two Weet-Bix with 200 mils of milk.");

  it("extracts the glucose value", () => {
    expect(event.glucose?.value.value).toBe(8.4);
  });

  it("extracts both food components with their quantities", () => {
    const components = event.meal?.components ?? [];
    const weetbix = components.find((c) => c.phrase === "weet-bix");
    expect(weetbix?.quantity.value).toBe(2);

    const milk = components.find((c) => c.phrase === "milk");
    expect(milk?.quantity.value).toBe(200);
    expect(milk?.unit.value).toBe("ml");
    expect(milk?.quantityKind).toBe("MILLILITRES");
  });

  it("does not extract an insulin mention that was never stated", () => {
    expect(event.recentInsulin).toBeNull();
  });
});

describe("acceptance test 5: mg/dL is detected explicitly, never guessed from magnitude", () => {
  const event = run("My blood glucose is 180 mg/dl.");

  it("extracts the unit as stated", () => {
    expect(event.glucose?.value.value).toBe(180);
    expect(event.glucose?.unit.value).toBe("MG_DL");
    expect(event.glucose?.unit.status).toBe("provisional");
  });
});

describe("acceptance test 6: relative insulin time (singular 'an hour ago')", () => {
  const event = run("I had 6 units of insulin an hour ago.");

  it("resolves 'an hour ago' to one hour before reference time", () => {
    expect(event.recentInsulin?.amountUnits.value).toBe(6);
    expect(event.recentInsulin?.takenAt.value).toBe(new Date(REFERENCE_NOW - 3_600_000).toISOString());
    expect(event.recentInsulin?.takenAt.status).toBe("provisional");
  });
});

describe("acceptance test 7: explicit clock time", () => {
  const event = run("I took 4 units of insulin at 3pm.");

  it("resolves the stated clock time on the reference date", () => {
    expect(event.recentInsulin?.takenAt.rawSpan).toBe("at 3pm");
    expect(event.recentInsulin?.takenAt.value).toBe("2026-07-25T15:00:00.000Z");
    expect(event.recentInsulin?.takenAt.status).toBe("provisional");
  });
});

describe("acceptance test 8: low-glucose statement with hypo symptoms", () => {
  const event = run("My glucose is 3.2 and I feel shaky and dizzy.");

  it("extracts the low glucose value", () => {
    expect(event.glucose?.value.value).toBe(3.2);
  });

  it("flags hypoglycaemia symptom language without inventing a diagnosis", () => {
    expect(event.symptoms.hypoSymptoms).toBe(true);
  });
});

describe("acceptance test 9: spoken self-correction", () => {
  const event = run(
    "I am eating a ham sandwich with two slices of white bread and a little butter. I meant three slices, not two.",
  );

  it("applies the correction to the matching quantity and records it", () => {
    const bread = event.meal?.components.find((c) => c.phrase === "white bread");
    expect(bread?.quantity.value).toBe(3);
    expect(event.correctionsApplied).toHaveLength(1);
    expect(event.correctionsApplied[0]?.previousValue).toBe(2);
    expect(event.correctionsApplied[0]?.correctedValue).toBe(3);
  });
});

describe("acceptance test 10: multiple foods and a drink", () => {
  const event = run("I am eating one banana, a yogurt, and 250 ml of orange juice.");

  it("extracts three fully-quantified components with no blocking clarifications", () => {
    const components = event.meal?.components ?? [];
    expect(components).toHaveLength(3);
    expect(components.every((c) => c.matchStatus !== "missing")).toBe(true);

    const juice = components.find((c) => c.phrase === "orange juice");
    expect(juice?.quantity.value).toBe(250);
    expect(juice?.unit.value).toBe("ml");
  });
});

describe("acceptance test 11: ambiguous insulin concentration requires clarification", () => {
  const event = run("I took 5 units of concentrated insulin.");

  it("flags the concentration ambiguity and blocks on it", () => {
    expect(event.recentInsulin?.concentratedInsulinAmbiguity).toBe(true);
    const question = event.clarifications.find((c) => c.field === "recentInsulin.insulinType");
    expect(question?.blocking).toBe(true);
    expect(question?.question).toContain("concentrated");
  });
});

describe("acceptance test 12: no dose calculation before review", () => {
  it("segmentEvent's source never references a bolus calculation function", () => {
    const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const forbidden = ["calculateMealBolus", "calculateCorrectionBolus", "calculateBolusPreview", "confirmBolus"];
    for (const file of fs.readdirSync(srcDir)) {
      const contents = fs.readFileSync(path.join(srcDir, file), "utf8");
      for (const name of forbidden) {
        expect(contents.includes(name)).toBe(false);
      }
    }
  });

  it("a provisional event carries only unconfirmed candidate values", () => {
    const event = run("My blood glucose is 15. I took 4 units of insulin two hours ago and I am eating a banana.");
    const allStatuses = [
      event.glucose?.value.status,
      event.glucose?.unit.status,
      event.recentInsulin?.amountUnits.status,
      ...(event.meal?.components.map((c) => c.matchStatus) ?? []),
    ];
    expect(allStatuses.every((status) => status !== "confirmed")).toBe(true);
  });
});

describe("acceptance test 13: no raw database records in extracted components", () => {
  it("a food component only ever exposes review-safe fields, never a raw record", () => {
    const event = run("I am eating a banana and 200 ml of milk.");
    const allowedKeys = new Set([
      "phrase",
      "rawSpan",
      "quantity",
      "unit",
      "quantityKind",
      "selectedServingMeasureId",
      "qualifier",
      "matchStatus",
      "quantityNeededForCalculation",
    ]);
    for (const component of event.meal?.components ?? []) {
      for (const key of Object.keys(component)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });
});

describe("acceptance test 14: dictated text behaves identically to typed text", () => {
  it("segmentEvent is a pure function of its text input", () => {
    const text =
      "My blood glucose is 15. I took 4 units of insulin two hours ago and I am eating a ham sandwich with two slices of white bread and a little butter.";
    const first = run(text);
    const second = run(text);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("regression: 'a meal of X' filler phrase must not become the food name", () => {
  const event = run("I ate a meal of bread and butter.");

  it("strips the 'a meal of' lead-in so 'bread' is the food, not 'meal of bread'", () => {
    const components = event.meal?.components ?? [];
    const bread = components.find((c) => c.phrase === "bread");
    expect(bread).toBeDefined();
    expect(components.some((c) => c.phrase.includes("meal"))).toBe(false);
  });

  it("asks a correct, clean clarification question for the unquantified bread", () => {
    const question = event.clarifications.find((c) => c.field.startsWith("meal.components"));
    expect(question?.question).toBe("How many slices of bread did you have?");
  });

  it("does not block on butter, a negligible-carbohydrate food regardless of quantity", () => {
    const butter = event.meal?.components.find((c) => c.phrase === "butter");
    expect(butter?.matchStatus).toBe("provisional");
    expect(butter?.quantityNeededForCalculation).toBe(false);
    expect(event.clarifications.some((c) => c.field.includes("butter"))).toBe(false);
  });

  it("also strips 'a plate of'/'a serving of' the same way", () => {
    const plateEvent = run("I am eating a plate of rice.");
    expect(plateEvent.meal?.components[0]?.phrase).toBe("rice");
    const servingEvent = run("I am eating a serving of pasta.");
    expect(servingEvent.meal?.components[0]?.phrase).toBe("pasta");
  });
});


describe("parsing guardrail library: quantities, units, and low-friction clarifications", () => {
  it("reproduces the historical toast failure and keeps the stated quantity with the food", () => {
    const event = run("I am eating two pieces of toast.");
    const toast = event.meal?.components.find((component) => component.phrase === "toast");

    expect(toast?.rawSpan).toBe("two pieces of toast");
    expect(toast?.quantity.value).toBe(2);
    expect(toast?.unit.value).toBe("pieces");
    expect(toast?.quantityKind).toBe("COUNT");
    expect(toast?.matchStatus).toBe("provisional");
    expect(event.clarifications.some((clarification) => clarification.field === "meal.components[0].quantity")).toBe(false);
  });

  it("treats a digit quantity and a numeral word equivalently", () => {
    const digitEvent = run("I am eating 2 pieces of toast.");
    const wordEvent = run("I am eating two pieces of toast.");

    for (const event of [digitEvent, wordEvent]) {
      const toast = event.meal?.components.find((component) => component.phrase === "toast");
      expect(toast?.quantity.value).toBe(2);
      expect(toast?.unit.value).toBe("pieces");
      expect(toast?.matchStatus).toBe("provisional");
    }
  });

  it("parses fractions without leaving the article in the food name", () => {
    const halfEvent = run("I am eating half a banana.");
    const banana = halfEvent.meal?.components.find((component) => component.phrase === "banana");
    expect(banana?.quantity.value).toBe(0.5);
    expect(banana?.quantityKind).toBe("COUNT");
    expect(banana?.matchStatus).toBe("provisional");

    const thirdCupEvent = run("I am having a third of a cup of rice.");
    const rice = thirdCupEvent.meal?.components.find((component) => component.phrase === "rice");
    expect(rice?.quantity.value).toBeCloseTo(1 / 3);
    expect(rice?.unit.value).toBe("cup");
    expect(rice?.matchStatus).toBe("provisional");
  });

  it("preserves informal quantity language for one focused follow-up rather than inventing an amount", () => {
    const event = run("I am eating a hand of cashews and a splash of milk.");
    const cashews = event.meal?.components.find((component) => component.phrase === "cashews");
    const milk = event.meal?.components.find((component) => component.phrase === "milk");

    expect(cashews?.qualifier).toBe("a hand of");
    expect(cashews?.matchStatus).toBe("requires_review");
    expect(milk?.qualifier).toBe("a splash of");
    expect(milk?.matchStatus).toBe("requires_review");
    expect(event.clarifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "meal.components[0].quantity", question: expect.stringContaining("cashews") }),
        expect.objectContaining({ field: "meal.components[1].quantity", question: expect.stringContaining("milk") }),
      ]),
    );
  });

  it("keeps countable, weight, and volume quantities attached to their respective foods in one multi-food utterance", () => {
    const event = run("I am eating two slices of toast, 30 g of cheese, and 200 ml of milk.");
    const toast = event.meal?.components.find((component) => component.phrase === "toast");
    const cheese = event.meal?.components.find((component) => component.phrase === "cheese");
    const milk = event.meal?.components.find((component) => component.phrase === "milk");

    expect(toast?.quantity.value).toBe(2);
    expect(toast?.quantityKind).toBe("COUNT");
    expect(cheese?.quantity.value).toBe(30);
    expect(cheese?.quantityKind).toBe("GRAMS");
    expect(milk?.quantity.value).toBe(200);
    expect(milk?.quantityKind).toBe("MILLILITRES");
    expect(event.clarifications.some((clarification) => clarification.field.startsWith("meal.components"))).toBe(false);
  });

  it("asks one short question that references the food when quantity is genuinely absent", () => {
    const event = run("I am eating toast.");
    const questions = event.clarifications.filter((clarification) => clarification.field.startsWith("meal.components"));

    expect(questions).toHaveLength(1);
    expect(questions[0]?.question).toBe("How many slices of toast did you have?");
    expect(questions[0]?.blocking).toBe(true);
  });
});


describe("spoken-language interpretation library: contextual recognition with review-gated uncertainty", () => {
  it("recognises sugar, BGL, a spoken decimal, and an explicit-unit pronoun phrase as glucose candidates", () => {
    const sugar = run("My sugar is eight point four.");
    expect(sugar.glucose?.value.value).toBe(8.4);
    expect(sugar.glucose?.unit.status).toBe("missing");

    const bgl = run("My BGL is 180 mg/dl.");
    expect(bgl.glucose?.value.value).toBe(180);
    expect(bgl.glucose?.unit.value).toBe("MG_DL");

    const pronoun = run("I'm at 5.4 mmol/l.");
    expect(pronoun.glucose?.value.value).toBe(5.4);
    expect(pronoun.glucose?.value.status).toBe("requires_review");
    expect(pronoun.clarifications.some((clarification) => clarification.field === "glucose.value" && clarification.blocking)).toBe(true);
  });

  it("recovers bounded cue-word transcription variants without manufacturing a value", () => {
    const event = run("My glucos is eight point four.");
    expect(event.glucose?.value.value).toBe(8.4);
    expect(event.glucose?.unit.status).toBe("missing");

    const missing = run("My insuline dose was units this morning.");
    expect(missing.recentInsulin?.amountUnits.value).toBeNull();
    expect(missing.recentInsulin?.amountUnits.status).toBe("missing");
  });

  it("recognises varied insulin administration language but still blocks on non-specific timing", () => {
    const injected = run("I injected four units of Fiasp about 30 minutes ago.");
    expect(injected.recentInsulin?.amountUnits.value).toBe(4);
    expect(injected.recentInsulin?.insulinType.value).toBe("fiasp");
    expect(injected.recentInsulin?.takenAt.value).toBe(new Date(REFERENCE_NOW - 30 * 60_000).toISOString());
    expect(injected.recentInsulin?.takenAt.status).toBe("requires_review");

    const vague = run("I bolused 3 units this morning.");
    expect(vague.recentInsulin?.takenAt.value).toBeNull();
    expect(vague.recentInsulin?.takenAt.status).toBe("requires_review");
    expect(vague.clarifications.some((clarification) => clarification.field === "recentInsulin.takenAt" && clarification.blocking)).toBe(true);
  });

  it("treats a couple, pair, both, and dozen as exact stated counts while leaving a few unresolved", () => {
    const event = run("I am eating a couple of biscuits, a pair of cookies, both crackers, a dozen grapes, and a few pretzels.");
    const components = event.meal?.components ?? [];

    expect(components.find((component) => component.phrase === "biscuits")?.quantity.value).toBe(2);
    expect(components.find((component) => component.phrase === "cookies")?.quantity.value).toBe(2);
    expect(components.find((component) => component.phrase === "crackers")?.quantity.value).toBe(2);
    expect(components.find((component) => component.phrase === "grapes")?.quantity.value).toBe(12);
    expect(components.find((component) => component.phrase === "pretzels")?.matchStatus).toBe("requires_review");
  });

  it("keeps a serving unresolved until a database measure is selected in review", () => {
    const event = run("I just had a serving of rice.");
    const rice = event.meal?.components[0];

    expect(rice?.phrase).toBe("rice");
    expect(rice?.quantityKind).toBe("SERVING");
    expect(rice?.quantity.value).toBe(1);
    expect(rice?.selectedServingMeasureId).toBeNull();
    expect(rice?.matchStatus).toBe("requires_review");
    expect(event.clarifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "meal.components[0].serving", blocking: true })]),
    );
  });

  it("recognises drinking and high-number spoken portions without confusing food language for glucose", () => {
    const drink = run("I drank 200ml of juice.");
    const juice = drink.meal?.components.find((component) => component.phrase === "juice");
    expect(juice?.quantity.value).toBe(200);
    expect(juice?.quantityKind).toBe("MILLILITRES");
    expect(drink.glucose).toBeNull();

    const portion = run("I consumed thirty five grams of cereal.");
    const cereal = portion.meal?.components.find((component) => component.phrase === "cereal");
    expect(cereal?.quantity.value).toBe(35);
    expect(cereal?.quantityKind).toBe("GRAMS");
  });

  it("never accepts a bare number without a glucose cue or an explicit glucose unit", () => {
    const event = run("I had 8 biscuits.");
    expect(event.glucose).toBeNull();
  });
});
