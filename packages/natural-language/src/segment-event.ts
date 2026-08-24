import { normaliseText, splitClauses } from "./normalise.js";
import { extractGlucose } from "./extract-glucose.js";
import { extractInsulin } from "./extract-insulin.js";
import { extractFoods } from "./extract-foods.js";
import { detectSymptoms } from "./detect-symptoms.js";
import { applyCorrections, generateClarifications } from "./ambiguity.js";
import type { GlucoseExtraction, InsulinExtraction, MealPipelineTrace, ProvisionalEvent } from "./types.js";

function pipelineFromMeal(originalText: string, meal: ProvisionalEvent["meal"]): MealPipelineTrace | null {
  if (!meal) return null;
  const parsed = meal.parsedMeal;
  return {
    rawInput: originalText,
    mealText: parsed.mealText,
    parsedMeal: parsed,
    parseSource: parsed.parseSource,
    completenessValid: parsed.completeness.valid,
    confidenceGate: parsed.confidenceGate,
  };
}

/**
 * The single entry point for turning dictated or typed text into a
 * ProvisionalEvent. This never calculates a bolus, never infers a missing
 * clinical value, and never lets a value skip user review - it only
 * extracts candidates, classifies what's missing, and asks for what the
 * carbohydrate calculation or the bolus module's existing safety gates
 * actually require. Every extractor call below is a pure function over
 * normalised text; nothing here performs I/O, network access, or dose
 * arithmetic.
 *
 * Meal language is parsed from the full utterance (not per clause, and not
 * by fuzzy-matching the whole sentence against one food record). Glucose
 * and insulin still scan clause-by-clause so run-on dictation cannot drop them.
 */
export function segmentEvent(originalText: string, referenceNowMs: number): ProvisionalEvent {
  const normalisedText = normaliseText(originalText);
  const clauses = splitClauses(normalisedText);

  let glucose: GlucoseExtraction | null = null;
  let recentInsulin: InsulinExtraction | null = null;

  for (const clause of clauses) {
    if (!glucose) glucose = extractGlucose(clause, referenceNowMs);
    if (!recentInsulin) recentInsulin = extractInsulin(clause, referenceNowMs);
  }

  const extractedMeal = extractFoods(normalisedText);
  const symptoms = detectSymptoms(normalisedText);

  const { meal, correctionsApplied } = applyCorrections(normalisedText, extractedMeal);

  const clarifications = generateClarifications({ glucose, recentInsulin, meal });

  return {
    originalText,
    normalisedText,
    glucose,
    recentInsulin,
    meal,
    symptoms,
    clarifications,
    correctionsApplied,
    referenceNow: new Date(referenceNowMs).toISOString(),
    mealPipeline: pipelineFromMeal(originalText, meal),
  };
}
