import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import type { ClarificationQuestion, CorrectionApplied, FoodComponentExtraction, ProvisionalEvent } from "./types.js";

/** Food-name substrings with a conventional counting unit, used only to phrase a clarification question. */
const FOOD_UNIT_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbread\b/i, "slices"],
  [/\btoast\b/i, "slices"],
];

function unitHintFor(phrase: string): string | null {
  for (const [pattern, unitWord] of FOOD_UNIT_HINTS) {
    if (pattern.test(phrase)) return unitWord;
  }
  return null;
}

function foodClarification(component: FoodComponentExtraction, index: number, containerContext: string | null): ClarificationQuestion | null {
  const field = `meal.components[${index}]`;

  if (component.matchStatus === "missing") {
    const unitHint = unitHintFor(component.phrase);
    const question =
      unitHint && containerContext
        ? `How many ${unitHint} of ${component.phrase} are in the ${containerContext}?`
        : unitHint
          ? `How many ${unitHint} of ${component.phrase} did you have?`
          : `How much ${component.phrase} did you have?`;
    return { field: `${field}.quantity`, question, blocking: true };
  }

  if (component.matchStatus === "requires_review" && component.qualifier) {
    return {
      field: `${field}.quantity`,
      question: `You said "${component.qualifier} ${component.phrase}" - about how much ${component.phrase} was that?`,
      blocking: true,
    };
  }

  return null;
}

/**
 * Builds the reviewable clarification questions for a provisional event.
 * This only asks about values the handoff's gates or the carbohydrate
 * calculation actually need - it never asks for provenance-only detail
 * beyond what's already captured, and it never picks a value itself.
 */
export function generateClarifications(event: Pick<ProvisionalEvent, "glucose" | "recentInsulin" | "meal">): ClarificationQuestion[] {
  const clarifications: ClarificationQuestion[] = [];

  if (event.glucose && event.glucose.unit.status === "missing") {
    clarifications.push({
      field: "glucose.unit",
      question: "What unit is your glucose reading in - mmol/L or mg/dL?",
      blocking: true,
    });
  }

  if (event.recentInsulin) {
    const insulin = event.recentInsulin;

    if (insulin.amountUnits.status === "missing") {
      const timePhrase = insulin.takenAt.status === "missing" ? "" : ` ${insulin.takenAt.rawSpan}`;
      clarifications.push({
        field: "recentInsulin.amountUnits",
        question: `How many units of insulin did you take${timePhrase}?`,
        blocking: true,
      });
    }

    if (insulin.takenAt.status === "missing") {
      clarifications.push({
        field: "recentInsulin.takenAt",
        question: "When did you take that insulin?",
        blocking: true,
      });
    }

    if (insulin.concentratedInsulinAmbiguity) {
      clarifications.push({
        field: "recentInsulin.insulinType",
        question: "Is this a concentrated insulin (e.g. U-500, U-200) or a standard concentration?",
        blocking: true,
      });
    }
  }

  if (event.meal) {
    event.meal.components.forEach((component, index) => {
      const clarification = foodClarification(component, index, event.meal!.containerContext);
      if (clarification) clarifications.push(clarification);
    });
  }

  return clarifications;
}

const CORRECTION_PATTERN = /\bi meant\s+(.+?),?\s*not\s+(.+?)(?:[.!]|$)/i;

function firstQuantityToken(phrase: string): number | null {
  const match = phrase.match(new RegExp(QUANTITY_PATTERN, "i"));
  return match ? parseQuantityToken(match[0]) : null;
}

/**
 * Detects a spoken self-correction ("I meant three slices, not two") and,
 * if a food component's previously extracted quantity matches the value
 * being corrected away from, applies the correction. This never introduces
 * a new value out of nothing - it only relabels a quantity the user has
 * just explicitly stated was wrong, and the correction is recorded so the
 * review screen can show what changed.
 */
export function applyCorrections(
  text: string,
  meal: ProvisionalEvent["meal"],
): { meal: ProvisionalEvent["meal"]; correctionsApplied: CorrectionApplied[] } {
  const match = text.match(CORRECTION_PATTERN);
  if (!match || !meal) return { meal, correctionsApplied: [] };

  const correctedNumber = firstQuantityToken(match[1]!);
  const previousNumber = firstQuantityToken(match[2]!);
  if (correctedNumber === null || previousNumber === null) return { meal, correctionsApplied: [] };

  const correctionsApplied: CorrectionApplied[] = [];
  const components = meal.components.map((component) => {
    if (component.quantity.value !== previousNumber) return component;

    correctionsApplied.push({
      field: "meal.components.quantity",
      previousValue: previousNumber,
      correctedValue: correctedNumber,
      correctionText: match[0],
    });

    return {
      ...component,
      quantity: { ...component.quantity, value: correctedNumber, rawSpan: match[1]!.trim(), status: "provisional" as const },
    };
  });

  return { meal: { ...meal, components }, correctionsApplied };
}
