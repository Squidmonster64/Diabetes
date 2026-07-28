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
