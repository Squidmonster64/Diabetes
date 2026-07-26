import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, InsulinExtraction } from "./types.js";

const KNOWN_INSULIN_TYPES = ["novorapid", "novo rapid", "humalog", "apidra", "fiasp", "lyumjev", "actrapid"];

/**
 * Matches "took/had X unit(s) [of insulin]" where X is a number (digit or
 * word). Deliberately does NOT match the bare word "units" as a number -
 * "I took units of insulin" must produce a missing-amount result, never
 * silently interpret "units" itself as a quantity.
 */
const AMOUNT_PATTERN = new RegExp(
  `\\b(?:took|had|taken|gave\\s+myself)\\s+(${QUANTITY_PATTERN})\\s+units?\\b`,
  "i",
);

/** Detects the insulin-mention-without-a-number case, e.g. "took units of insulin". */
const MENTIONS_INSULIN_NO_AMOUNT = /\b(?:took|had|taken|gave\s+myself)\s+units?\s+of\s+insulin\b/i;
const MENTIONS_INSULIN_GENERAL = /\binsulin\b/i;

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
  return /\bconcentrated\b/i.test(clause) || /\bu-?500\b/i.test(clause) || /\bu-?200\b/i.test(clause);
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
  const hasAmountMatch = clause.match(AMOUNT_PATTERN);
  const hasNoAmountMention = MENTIONS_INSULIN_NO_AMOUNT.test(clause);
  const hasGeneralMention = MENTIONS_INSULIN_GENERAL.test(clause);

  if (!hasAmountMatch && !hasNoAmountMention && !hasGeneralMention) return null;

  let amountUnits: ExtractedValue<number>;
  if (hasAmountMatch) {
    const parsed = parseQuantityToken(hasAmountMatch[1]!);
    amountUnits =
      parsed === null
        ? missingAmount(hasAmountMatch[0])
        : { rawSpan: hasAmountMatch[0], value: parsed, confidence: 0.9, status: "provisional", requiresConfirmation: true };
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
