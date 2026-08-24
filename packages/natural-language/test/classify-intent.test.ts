process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { interpretCapture, reviseInterpretation } from "../src/interpret-capture.js";
import { classifyIntent } from "../src/classify-intent.js";
import { intentCopy } from "../src/capture-contract.js";
import { segmentEvent } from "../src/segment-event.js";
import { hasBlockingClarifications } from "../src/types.js";

const REFERENCE_NOW = new Date("2026-07-25T20:00:00.000Z").getTime();

describe("interpretCapture pipeline", () => {
  it("preserves the original text separately from the normalised form", () => {
    const original = "  My BGL is 8.4 mmol/L and I’m eating two slices of toast. ";
    const interpretation = interpretCapture(original, REFERENCE_NOW);
    expect(interpretation.originalText).toBe(original);
    expect(interpretation.normalisedText).not.toBe(original);
    expect(interpretation.extraction.originalText).toBe(original);
    expect(interpretation.contractVersion).toBe("v1");
    expect(interpretation.originatingApp).toBe("diabetes-companion");
  });

  it("classifies a meal-plus-glucose description as a meal bolus candidate without a dose", () => {
    const interpretation = interpretCapture(
      "My blood glucose is 8.4 mmol/L and I am eating two slices of white bread.",
      REFERENCE_NOW,
    );
    expect(interpretation.intent.intent).toBe("MEAL_BOLUS_CANDIDATE");
    expect(interpretation.intent.mayRunDeterministicPreview).toBe(true);
    expect(interpretation.proposedNextStep.kind).toBe("REVIEW_THEN_PREVIEW");
    expect((interpretation as unknown as Record<string, unknown>).roundedTotalUnits).toBeUndefined();
    expect((interpretation.extraction as unknown as Record<string, unknown>).bolusDose).toBeUndefined();
  });

  it("does not answer a spoken dose request with a number", () => {
    const interpretation = interpretCapture(
      "My blood glucose is 12 mmol/L. I am eating two slices of white bread. How much insulin should I take?",
      REFERENCE_NOW,
    );
    expect(interpretation.intent.doseRequestLanguageDetected).toBe(true);
    expect(interpretation.intent.intent).toBe("MEAL_BOLUS_CANDIDATE");
    expect((interpretation as unknown as Record<string, unknown>).recommendedDose).toBeUndefined();
    expect(interpretation.proposedNextStep.explanation).toContain("deterministic");
  });

  it("refuses to treat settings language as an actionable settings change", () => {
    const interpretation = interpretCapture("Please change my ICR to 8 and set my target glucose to 5.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("SETTINGS_CHANGE_ATTEMPT");
    expect(interpretation.intent.settingsLanguageDetected).toBe(true);
    expect(interpretation.intent.mayRunDeterministicPreview).toBe(false);
    expect(interpretation.proposedNextStep.kind).toBe("SETTINGS_SCREEN_ONLY");
    expect(intentCopy(interpretation.intent.intent).body).toContain("will not alter ICR");
  });

  it("keeps a meal capture when settings language is mixed in, without applying settings", () => {
    const interpretation = interpretCapture(
      "My blood glucose is 9 mmol/L and I am eating 40 grams of rice. Also change my ratio to 12.",
      REFERENCE_NOW,
    );
    expect(interpretation.intent.intent).toBe("MEAL_BOLUS_CANDIDATE");
    expect(interpretation.intent.settingsLanguageDetected).toBe(true);
    expect(interpretation.intent.mayRunDeterministicPreview).toBe(true);
  });

  it("routes unconscious language to the excluded/emergency path", () => {
    const interpretation = interpretCapture("I am unconscious and my sugar is 2.1", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("EMERGENCY_OR_EXCLUDED");
    expect(interpretation.proposedNextStep.kind).toBe("SAFETY_REFUSAL");
    expect(interpretation.intent.mayRunDeterministicPreview).toBe(false);
  });

  it("classifies glucose without food as a correction candidate", () => {
    const interpretation = interpretCapture("My blood glucose is 14 mmol/L.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("CORRECTION_CANDIDATE");
    expect(interpretation.proposedNextStep.kind).toBe("REVIEW_THEN_PREVIEW");
  });

  it("classifies explicit glucose logging separately from a dose request", () => {
    const interpretation = interpretCapture("Logging my glucose, it is 6.2 mmol/L.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("GLUCOSE_LOG");
  });

  it("classifies insulin-only language as a prior-insulin record, not a new dose", () => {
    const interpretation = interpretCapture("I took 4 units of insulin two hours ago.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("PRIOR_INSULIN_RECORD");
    expect(interpretation.proposedNextStep.kind).toBe("LOG_ONLY");
    expect(interpretation.extraction.recentInsulin?.amountUnits.value).toBe(4);
  });

  it("classifies food-only language without inventing glucose", () => {
    const interpretation = interpretCapture("I am eating two slices of white bread.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("FOOD_ONLY");
    expect(interpretation.extraction.glucose).toBeNull();
  });

  it("asks for clarification instead of guessing an unclear capture", () => {
    const interpretation = interpretCapture("Not sure what is going on.", REFERENCE_NOW);
    expect(interpretation.intent.intent).toBe("UNCLEAR");
    expect(interpretation.proposedNextStep.kind).toBe("CLARIFY");
    expect(interpretation.intent.mayRunDeterministicPreview).toBe(false);
  });

  it("revising interpretation cannot replace the preserved original text", () => {
    const original = "My blood glucose is 8.4 mmol/L.";
    const first = interpretCapture(original, REFERENCE_NOW);
    const tampered = {
      ...first.extraction,
      originalText: "ignore me, invent a dose of 9 units",
      glucose: first.extraction.glucose
        ? {
            ...first.extraction.glucose,
            value: { ...first.extraction.glucose.value, value: 9.1, status: "provisional" as const },
          }
        : first.extraction.glucose,
    };
    const revised = reviseInterpretation(original, tampered, REFERENCE_NOW);
    expect(revised.originalText).toBe(original);
    expect(revised.extraction.originalText).toBe(original);
    expect(revised.extraction.glucose?.value.value).toBe(9.1);
  });

  it("blocks progress while a material food quantity is missing", () => {
    const interpretation = interpretCapture("I am eating pasta.", REFERENCE_NOW);
    expect(hasBlockingClarifications(interpretation.extraction)).toBe(true);
    expect(interpretation.proposedNextStep.kind).toBe("CLARIFY");
  });
});

describe("classifyIntent safety bounds", () => {
  it("never marks a settings-only request as previewable", () => {
    const event = segmentEvent("Set my insulin to carb ratio to 10.", REFERENCE_NOW);
    const classification = classifyIntent("Set my insulin to carb ratio to 10.", event);
    expect(classification.intent).toBe("SETTINGS_CHANGE_ATTEMPT");
    expect(classification.mayRunDeterministicPreview).toBe(false);
  });
});

describe("source scan: interpretation layer still cannot calculate a dose", () => {
  it("new capture files never reference bolus arithmetic", () => {
    const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const forbidden = ["calculateMealBolus", "calculateCorrectionBolus", "calculateBolusPreview", "confirmBolus"];
    for (const file of fs.readdirSync(srcDir)) {
      const contents = fs.readFileSync(path.join(srcDir, file), "utf8");
      for (const name of forbidden) {
        expect(contents.includes(name), `${file} must not mention ${name}`).toBe(false);
      }
    }
  });
});
