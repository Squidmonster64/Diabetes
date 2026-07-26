import { normaliseText, splitClauses } from "./normalise.js";
import { extractGlucose } from "./extract-glucose.js";
import { extractInsulin } from "./extract-insulin.js";
import { extractFoods } from "./extract-foods.js";
import { detectSymptoms } from "./detect-symptoms.js";
import { applyCorrections, generateClarifications } from "./ambiguity.js";
import type { FoodComponentExtraction, GlucoseExtraction, InsulinExtraction, MealExtraction, ProvisionalEvent } from "./types.js";

function mergeMeals(meals: MealExtraction[]): MealExtraction | null {
  if (meals.length === 0) return null;
  const components: FoodComponentExtraction[] = meals.flatMap((meal) => meal.components);
  const containerContext = meals.find((meal) => meal.containerContext !== null)?.containerContext ?? null;
  return { components, containerContext };
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
 */
export function segmentEvent(originalText: string, referenceNowMs: number): ProvisionalEvent {
  const normalisedText = normaliseText(originalText);
  const clauses = splitClauses(normalisedText);

  let glucose: GlucoseExtraction | null = null;
  let recentInsulin: InsulinExtraction | null = null;
  const meals: MealExtraction[] = [];

  for (const clause of clauses) {
    if (!glucose) glucose = extractGlucose(clause, referenceNowMs);
    if (!recentInsulin) recentInsulin = extractInsulin(clause, referenceNowMs);
    const meal = extractFoods(clause);
    if (meal) meals.push(meal);
  }

  const mergedMeal = mergeMeals(meals);
  const symptoms = detectSymptoms(normalisedText);

  const { meal, correctionsApplied } = applyCorrections(normalisedText, mergedMeal);

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
  };
}
