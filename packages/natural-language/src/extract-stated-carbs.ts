import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import type { ExtractedValue } from "./types.js";

/**
 * Explicit user-stated carbohydrate amount, e.g. "45 grams of carbs".
 * This records what the person said. It is not a food-database lookup and
 * it is never turned into an insulin dose by this package.
 */
const STATED_CARBS = new RegExp(
  `\\b(${QUANTITY_PATTERN})\\s*(?:g|grams?|grammes?)\\s+(?:of\\s+)?(?:carbs?|carbohydrate)\\b`,
  "i",
);
const STATED_CARBS_FLIPPED = new RegExp(
  `\\b(?:carbs?|carbohydrate)\\s*(?:of|:)?\\s*(${QUANTITY_PATTERN})\\s*(?:g|grams?|grammes?)\\b`,
  "i",
);
const STATED_CARBS_SHORT = new RegExp(
  `\\b(${QUANTITY_PATTERN})\\s*(?:g|grams?|grammes?)\\s+carbs?\\b`,
  "i",
);
const APPROX_CARBS = new RegExp(
  `\\bcarbs?\\s+(${QUANTITY_PATTERN})-?ish\\b`,
  "i",
);
const PROBABLY_CARBS = new RegExp(
  `\\bprobably\\s+(${QUANTITY_PATTERN})\\s+carbs?\\b`,
  "i",
);
const LABEL_CARBS = new RegExp(
  `\\b(?:the\\s+)?label\\s+says\\s+(${QUANTITY_PATTERN})\\s+(?:g|grams?)\\s+carbs?\\b`,
  "i",
);
const PER_SLICE_CARBS = new RegExp(
  `\\b(${QUANTITY_PATTERN})\\s+(?:g|grams?)\\s+carbs?\\s+per\\s+slice\\b`,
  "i",
);
const BARE_CARBS_NUMBER = new RegExp(
  `\\b(?:≈|about\\s+|around\\s+)?(${QUANTITY_PATTERN})\\s+carbs?\\b`,
  "i",
);
const BARE_CARBS_FLIPPED = new RegExp(`\\bcarbs?\\s+(${QUANTITY_PATTERN})\\b`, "i");
const AMBIGUOUS_OR_CARBS = new RegExp(
  `\\b(${QUANTITY_PATTERN})\\s+or\\s+(${QUANTITY_PATTERN})\\s+(?:g|grams?)\\s+carbs?\\b`,
  "i",
);

const FABRICATION = /\b(?:make up|guess|invent|fabricate)\b[\s\S]{0,24}\bcarbs?\b/i;

function value(
  rawSpan: string,
  amount: number,
  status: ExtractedValue<number>["status"],
  confidence: number,
): ExtractedValue<number> {
  return { rawSpan, value: amount, confidence, status, requiresConfirmation: true };
}

export function extractStatedCarbs(text: string): ExtractedValue<number> | null {
  if (FABRICATION.test(text)) return null;

  const ambiguous = text.match(AMBIGUOUS_OR_CARBS);
  if (ambiguous) {
    return {
      rawSpan: ambiguous[0],
      value: null,
      confidence: 0.2,
      status: "requires_review",
      requiresConfirmation: true,
    };
  }

  const perSlice = text.match(PER_SLICE_CARBS);
  if (perSlice) {
    const grams = parseQuantityToken(perSlice[1]!);
    const slices = text.match(/\b(?:i\s+)?had\s+(${QUANTITY_PATTERN}|two|2)\b/i);
    const sliceCount = slices ? parseQuantityToken(slices[1] ?? "2") : parseQuantityToken(text.match(/\b(two|2)\b/i)?.[0] ?? "");
    if (grams !== null && sliceCount !== null) {
      return value(perSlice[0], grams * sliceCount, "requires_review", 0.7);
    }
    if (grams !== null) return value(perSlice[0], grams, "requires_review", 0.7);
  }

  const approx = text.match(APPROX_CARBS);
  if (approx) {
    const amount = parseQuantityToken(approx[1]!);
    if (amount !== null) return value(approx[0], amount, "requires_review", 0.55);
  }

  const probably = text.match(PROBABLY_CARBS);
  if (probably) {
    const amount = parseQuantityToken(probably[1]!);
    if (amount !== null) return value(probably[0], amount, "requires_review", 0.6);
  }

  const label = text.match(LABEL_CARBS);
  if (label) {
    const amount = parseQuantityToken(label[1]!);
    if (amount !== null) return value(label[0], amount, "provisional", 0.9);
  }

  const match = text.match(STATED_CARBS) ?? text.match(STATED_CARBS_SHORT) ?? text.match(STATED_CARBS_FLIPPED);
  if (match) {
    const amount = parseQuantityToken(match[1]!);
    if (amount !== null) return value(match[0], amount, "provisional", 0.95);
  }

  const bare = text.match(BARE_CARBS_NUMBER) ?? text.match(BARE_CARBS_FLIPPED);
  if (bare) {
    const amount = parseQuantityToken(bare[1]!);
    if (amount !== null) return value(bare[0], amount, "requires_review", 0.6);
  }

  return null;
}
