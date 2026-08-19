import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, GlucoseExtraction, GlucoseUnit } from "./types.js";

/**
 * Clinical-reading cues only. A food mention such as "sugar in my coffee"
 * cannot match because every form below requires a neighbouring stated value.
 */
const GLUCOSE_CUE = "(?:blood\\s+glucose|blood\\s+sugar|glucose|sugars?|bgl|bsl|bg|my\\s+(?:blood\\s+)?sugar|my\\s+(?:reading|level)|(?:blood\\s+)?level|(?:glucose\\s+)?reading)";
const CUE_VALUE_PATTERN = new RegExp(
  `\\b${GLUCOSE_CUE}\\s*(?:is|was|reads?|reading|of|at|sitting\\s+at|currently)?\\s*(${QUANTITY_PATTERN})\\b`,
  "i",
);
const READING_OF_VALUE_PATTERN = new RegExp(`\\b(?:a\\s+)?reading\\s+of\\s+(${QUANTITY_PATTERN})\\b`, "i");
const SITTING_AT_VALUE_PATTERN = new RegExp(`\\b(?:i(?:'m|\\s+am)\\s+)?sitting\\s+at\\s+(${QUANTITY_PATTERN})\\b`, "i");
const LOW_AT_PATTERN = new RegExp(`\\b(?:low|high)\\s+at\\s+(${QUANTITY_PATTERN})\\b`, "i");
/** Bare values are only accepted when the patient explicitly states a glucose unit. */
const EXPLICIT_UNIT_VALUE_PATTERN = new RegExp(`\\b(${QUANTITY_PATTERN})\\s*(?:mmol\\s*\\/\\s*l|mg\\s*\\/\\s*dl)\\b`, "i");
/** Pronouns remain safely contextual only when paired with an explicit glucose unit. */
const PRONOUN_WITH_UNIT_PATTERN = new RegExp(
  `\\b(?:it(?:'s|\\s+is)|i(?:'m|\\s+am))\\s+(?:at\\s+)?(${QUANTITY_PATTERN})\\s*(?:mmol\\s*\\/\\s*l|mg\\s*\\/\\s*dl)\\b`,
  "i",
);

function missingNumber(): ExtractedValue<number> {
  return { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function missingUnit(): ExtractedValue<GlucoseUnit> {
  return { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function detectUnit(clause: string): ExtractedValue<GlucoseUnit> {
  if (/\bmg\/dl\b/i.test(clause) || /\bmilligrams?\b/i.test(clause)) {
    const match = clause.match(/\bmg\/dl\b/i) ?? clause.match(/milligrams?[^.]*decilit(?:re|er)/i);
    return { rawSpan: match?.[0] ?? "mg/dl", value: "MG_DL", confidence: 0.95, status: "provisional", requiresConfirmation: true };
  }
  if (/\bmmol\/l\b/i.test(clause) || /\bmillimoles?\b/i.test(clause)) {
    const match = clause.match(/\bmmol\/l\b/i);
    return { rawSpan: match?.[0] ?? "mmol/l", value: "MMOL_L", confidence: 0.95, status: "provisional", requiresConfirmation: true };
  }
  return missingUnit();
}

/**
 * Extracts a current-glucose candidate from a clause. A numeric value is
 * never reinterpreted by its size: when no stated unit exists, the review UI
 * asks for one. Weakly contextual forms such as a bare "8.4 mmol/l" are
 * intentionally labelled `requires_review` despite containing an explicit
 * unit, so the patient sees what was understood before proceeding.
 */
export function extractGlucose(clause: string, referenceNowMs: number): GlucoseExtraction | null {
  const direct = clause.match(CUE_VALUE_PATTERN);
  const readingOf = !direct ? clause.match(READING_OF_VALUE_PATTERN) : null;
  const sittingAt = !direct && !readingOf ? clause.match(SITTING_AT_VALUE_PATTERN) : null;
  const lowOrHigh = !direct && !readingOf && !sittingAt ? clause.match(LOW_AT_PATTERN) : null;
  const pronounWithUnit = !direct && !readingOf && !sittingAt && !lowOrHigh ? clause.match(PRONOUN_WITH_UNIT_PATTERN) : null;
  const explicitUnit = !direct && !readingOf && !sittingAt && !lowOrHigh && !pronounWithUnit ? clause.match(EXPLICIT_UNIT_VALUE_PATTERN) : null;
  const valueMatch = direct ?? readingOf ?? sittingAt ?? lowOrHigh ?? pronounWithUnit ?? explicitUnit;

  if (!valueMatch) return null;

  const rawNumberSpan = valueMatch[1]!;
  const numeric = parseQuantityToken(rawNumberSpan);
  if (numeric === null || !Number.isFinite(numeric)) return null;

  const lowSignal = Boolean(pronounWithUnit || explicitUnit);
  const value: ExtractedValue<number> = {
    rawSpan: valueMatch[0],
    value: numeric,
    confidence: direct || readingOf ? 0.92 : sittingAt || lowOrHigh ? 0.85 : 0.65,
    status: lowSignal ? "requires_review" : "provisional",
    requiresConfirmation: true,
  };

  const unit = detectUnit(clause);
  const explicitTime = parseTimeExpression(clause, referenceNowMs);
  const timestamp: ExtractedValue<string> =
    explicitTime.status === "missing"
      ? {
          rawSpan: "",
          value: new Date(referenceNowMs).toISOString(),
          confidence: 0.6,
          status: "provisional",
          requiresConfirmation: true,
        }
      : explicitTime;

  return { value, unit, timestamp };
}

export { missingNumber as glucoseValueMissing };
