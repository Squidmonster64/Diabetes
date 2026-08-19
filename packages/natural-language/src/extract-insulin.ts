import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, InsulinExtraction } from "./types.js";

const KNOWN_INSULIN_TYPES = [
  "novorapid",
  "novo rapid",
  "novolog",
  "humalog",
  "apidra",
  "fiasp",
  "lyumjev",
  "actrapid",
  "insuman rapid",
  "insulin aspart",
  "insulin lispro",
  "insulin glulisine",
];

const ADMINISTRATION_VERB = "(?:took|had|taken|gave\\s+myself|given\\s+myself|injected|dosed|administered|shot|jabbed|bolused)";
const UNIT_TOKEN = "(?:units?|u)";

/**
 * Matches an explicit stated dose after a natural insulin-administration verb.
 * A valid quantity token is mandatory: the word `units` can never become an
 * amount on its own.
 */
const AMOUNT_PATTERN = new RegExp(
  `\\b${ADMINISTRATION_VERB}\\s+(?:my\\s+)?(${QUANTITY_PATTERN})\\s*${UNIT_TOKEN}\\b`,
  "i",
);
const INSULIN_WAS_AMOUNT_PATTERN = new RegExp(`\\bmy\\s+insulin\\s+(?:dose\\s+)?(?:was|is)\\s+(${QUANTITY_PATTERN})\\s*${UNIT_TOKEN}\\b`, "i");
/** Detects an insulin-administration statement with no stated quantity. */
const MENTIONS_INSULIN_NO_AMOUNT = new RegExp(
  `\\b${ADMINISTRATION_VERB}\\s+(?:my\\s+)?${UNIT_TOKEN}(?:\\s+of)?(?:\\s+insulin)?\\b`,
  "i",
);
const MENTIONS_INSULIN_GENERAL = /\b(?:insulin|novorapid|novo\s+rapid|novolog|humalog|apidra|fiasp|lyumjev|actrapid)\b/i;

function missingAmount(rawSpan: string): ExtractedValue<number> {
  return { rawSpan, value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function missingTakenAt(): ExtractedValue<string> {
  return { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function detectInsulinType(clause: string): ExtractedValue<string> {
  const lower = clause.toLowerCase();
  for (const type of KNOWN_INSULIN_TYPES) {
    if (lower.includes(type)) {
      return { rawSpan: type, value: type, confidence: 0.8, status: "provisional", requiresConfirmation: true };
    }
  }
  // Not stated: soft/non-blocking per the handoff - insulin type is only
  // required "when stated or required by the handoff" (concentration
  // ambiguity is handled separately via concentratedInsulinAmbiguity).
  return { rawSpan: "", value: null, confidence: 0, status: "requires_review", requiresConfirmation: true };
}

function detectConcentratedAmbiguity(clause: string): boolean {
  return /\b(?:concentrated|u-?(?:200|300|500))\b/i.test(clause);
}

/**
 * Extracts a prior/recent insulin dose mention from a clause. Returns null
 * if the clause has no insulin mention at all. This function never
 * calculates or infers an insulin amount - it either finds an explicit
 * stated number or reports it as missing, matching handoff conflict C-01's
 * hard lockout: this package must not manufacture a dose value under any
 * circumstance.
 */
export function extractInsulin(clause: string, referenceNowMs: number): InsulinExtraction | null {
  const hasAmountMatch = clause.match(AMOUNT_PATTERN) ?? clause.match(INSULIN_WAS_AMOUNT_PATTERN);
  const hasNoAmountMention = MENTIONS_INSULIN_NO_AMOUNT.test(clause);
  const hasGeneralMention = MENTIONS_INSULIN_GENERAL.test(clause);

  if (!hasAmountMatch && !hasNoAmountMention && !hasGeneralMention) return null;

  let amountUnits: ExtractedValue<number>;
  if (hasAmountMatch) {
    const parsed = parseQuantityToken(hasAmountMatch[1]!);
    amountUnits =
      parsed === null
        ? missingAmount(hasAmountMatch[0])
        : { rawSpan: hasAmountMatch[0], value: parsed, confidence: 0.92, status: "provisional", requiresConfirmation: true };
  } else {
    // "took/had ... units of insulin" with no number, or a bare "insulin"
    // mention with no amount at all - both are missing, never a guess.
    amountUnits = missingAmount(hasNoAmountMention ? "units" : "");
  }

  const explicitTime = parseTimeExpression(clause, referenceNowMs);
  const takenAt = explicitTime.status === "missing" ? missingTakenAt() : explicitTime;

  return {
    amountUnits,
    takenAt,
    insulinType: detectInsulinType(clause),
    concentratedInsulinAmbiguity: detectConcentratedAmbiguity(clause),
  };
}
