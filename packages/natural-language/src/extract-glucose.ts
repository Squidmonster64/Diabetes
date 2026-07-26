import { QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, GlucoseExtraction, GlucoseUnit } from "./types.js";

const GLUCOSE_KEYWORDS =
  /\b(?:blood\s+glucose|blood\s+sugar|glucose|my\s+reading|reading)\s+(?:is\s+|of\s+)?/i;
const LOW_AT_PATTERN = new RegExp(`\\blow\\s+at\\s+(${QUANTITY_PATTERN})\\b`, "i");
const HIGH_AT_PATTERN = new RegExp(`\\bhigh\\s+at\\s+(${QUANTITY_PATTERN})\\b`, "i");
const GLUCOSE_VALUE_PATTERN = new RegExp(`${GLUCOSE_KEYWORDS.source}(${QUANTITY_PATTERN})`, "i");

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
 * Extracts a current-glucose reading from a clause. Returns null if the
 * clause contains no glucose mention at all (distinct from "missing", which
 * means glucose was mentioned but a required sub-value like the unit is
 * absent).
 *
 * The unit is never guessed from the numeric value's plausible range - if
 * the clause doesn't state a unit, it is reported as "missing" so the
 * review screen can ask, rather than the parser silently assuming
 * mmol/L or mg/dL.
 */
export function extractGlucose(clause: string, referenceNowMs: number): GlucoseExtraction | null {
  let valueMatch: RegExpMatchArray | null = null;
  let rawNumberSpan: string | null = null;

  const lowAt = clause.match(LOW_AT_PATTERN);
  const highAt = clause.match(HIGH_AT_PATTERN);
  const direct = clause.match(GLUCOSE_VALUE_PATTERN);

  if (direct) {
    valueMatch = direct;
    rawNumberSpan = direct[1]!;
  } else if (lowAt) {
    valueMatch = lowAt;
    rawNumberSpan = lowAt[1]!;
  } else if (highAt) {
    valueMatch = highAt;
    rawNumberSpan = highAt[1]!;
  }

  if (!valueMatch || rawNumberSpan === null) return null;

  const numeric = Number(rawNumberSpan);
  if (!Number.isFinite(numeric)) return null;

  const value: ExtractedValue<number> = {
    rawSpan: valueMatch[0],
    value: numeric,
    confidence: direct ? 0.9 : 0.85,
    status: "provisional",
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
