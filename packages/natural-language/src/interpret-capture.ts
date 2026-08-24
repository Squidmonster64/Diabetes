import { classifyIntent, proposedNextStepFor } from "./classify-intent.js";
import { CAPTURE_CONTRACT_VERSION, ORIGINATING_APP, type CaptureInterpretation } from "./capture-contract.js";
import { generateClarifications, applyCorrections } from "./ambiguity.js";
import { segmentEvent } from "./segment-event.js";
import type { MealExtraction, ProvisionalEvent } from "./types.js";

function assertNoTreatmentInvention(interpretation: CaptureInterpretation): void {
  const record = interpretation as unknown as Record<string, unknown>;
  const extraction = interpretation.extraction as unknown as Record<string, unknown>;
  for (const key of ["bolusDose", "dose", "roundedTotalUnits", "unroundedTotalUnits", "recommendedDose"]) {
    if (record[key] !== undefined || extraction[key] !== undefined) {
      throw new Error("Capture interpretation must not carry a treatment dose.");
    }
  }
}

/**
 * Capture → preserve source → normalise → classify intent → extract
 * structured fields → check material ambiguity. The returned draft is
 * review-only. It never calculates a bolus.
 */
export function interpretCapture(originalText: string, referenceNowMs: number): CaptureInterpretation {
  const extraction = segmentEvent(originalText, referenceNowMs);
  const intent = classifyIntent(originalText, extraction);
  const interpretation: CaptureInterpretation = {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    originatingApp: ORIGINATING_APP,
    originalText: extraction.originalText,
    normalisedText: extraction.normalisedText,
    referenceNow: extraction.referenceNow,
    intent,
    extraction,
    proposedNextStep: proposedNextStepFor(intent, extraction),
  };
  assertNoTreatmentInvention(interpretation);
  return interpretation;
}

/**
 * Rebuilds clarifications and intent after a human edits extracted fields.
 * The original source text is forced back to the preserved capture text so
 * a revision can never rewrite what was said.
 */
export function reviseInterpretation(
  preservedOriginalText: string,
  extraction: ProvisionalEvent,
  referenceNowMs: number,
): CaptureInterpretation {
  const meal = extraction.meal as MealExtraction | null;
  const { meal: correctedMeal, correctionsApplied } = applyCorrections(preservedOriginalText, meal);
  const nextExtraction: ProvisionalEvent = {
    ...extraction,
    originalText: preservedOriginalText,
    meal: correctedMeal,
    correctionsApplied: [...extraction.correctionsApplied, ...correctionsApplied],
    clarifications: generateClarifications({
      glucose: extraction.glucose,
      recentInsulin: extraction.recentInsulin,
      meal: correctedMeal,
    }),
    referenceNow: new Date(referenceNowMs).toISOString(),
  };
  const intent = classifyIntent(preservedOriginalText, nextExtraction);
  const interpretation: CaptureInterpretation = {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    originatingApp: ORIGINATING_APP,
    originalText: preservedOriginalText,
    normalisedText: nextExtraction.normalisedText,
    referenceNow: nextExtraction.referenceNow,
    intent,
    extraction: nextExtraction,
    proposedNextStep: proposedNextStepFor(intent, nextExtraction),
  };
  assertNoTreatmentInvention(interpretation);
  return interpretation;
}
