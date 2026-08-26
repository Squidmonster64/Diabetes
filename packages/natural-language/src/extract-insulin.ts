import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, InsulinExtraction } from "./types.js";

const KNOWN_INSULIN_TYPES = [
  "novo rapid",
  "novorapid",
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
  "short acting",
  "short-acting",
  "fast acting",
  "fast-acting",
  "rapid insulin",
  "long acting",
  "long-acting",
  "rapid",
  "basal",
  "bolus",
];

const ADMINISTRATION_VERB = "(?:took|had|taken|gave\\s+myself|given\\s+myself|injected|dosed|administered|shot|jabbed|bolused|log that i took)";
const UNIT_TOKEN = "(?:units?|u)";

const PLANNED_OR_COMMANDED =
  /\b(?:give me\s+\d+|i should take|should i take|i might take|i may take|i(?:'m| am) about to take|i was going to take|i need\s+\d+(?:\.\d+)?\s*units?|don't log the insulin yet|i didn't take\s+\d+)\b/i;

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
const NOUN_FIRST_AMOUNT = new RegExp(
  `\\b(?:insulin|novorapid|novo\\s+rapid|novolog|humalog|apidra|fiasp|lyumjev|actrapid)\\s+(${QUANTITY_PATTERN})\\s*${UNIT_TOKEN}\\b`,
  "i",
);
const INJECTED_AMOUNT = new RegExp(`\\binjected\\s+(${QUANTITY_PATTERN})(?:\\s*${UNIT_TOKEN})?\\b`, "i");
const DIALLED_AMOUNT = new RegExp(`\\bdiall(?:ed|ed)\\s+(${QUANTITY_PATTERN})\\b`, "i");
const PRIMED_AMOUNT = new RegExp(`\\bprimed(?:\\s+the\\s+pen)?(?:\\s+with)?\\s+(${QUANTITY_PATTERN})\\s*${UNIT_TOKEN}\\b`, "i");
/** Detects an insulin-administration statement with no stated quantity. */
const MENTIONS_INSULIN_NO_AMOUNT = new RegExp(
  `\\b${ADMINISTRATION_VERB}\\s+(?:my\\s+)?${UNIT_TOKEN}(?:\\s+of)?(?:\\s+insulin)?\\b`,
  "i",
);
const MENTIONS_INSULIN_GENERAL = /\b(?:insulin|novorapid|novo\s+rapid|novolog|humalog|apidra|fiasp|lyumjev|actrapid|same dose)\b/i;
const DOSE_REQUEST_WITHOUT_ADMIN =
  /\b(?:how much insulin|calculate (?:the |a |my )?(?:meal )?dose|work out insulin|dose this meal|what dose should i take|give me a correction|correction dose)\b/i;
const ABSENT_INSULIN = /\bi haven(?:'t| not) taken any insulin\b/i;
const SPILLED = /\bspilled some insulin\b/i;
const TYPE_UNKNOWN = /\bdon't know which insulin\b/i;

function missingAmount(rawSpan: string): ExtractedValue<number> {
  return { rawSpan, value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function missingTakenAt(): ExtractedValue<string> {
  return { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

function detectInsulinType(clause: string): ExtractedValue<string> {
  const lower = clause.toLowerCase();
  if (/\bforgot whether the insulin was rapid or long acting\b/i.test(clause) || TYPE_UNKNOWN.test(clause)) {
    return { rawSpan: "", value: null, confidence: 0.2, status: "requires_review", requiresConfirmation: true };
  }
  for (const type of KNOWN_INSULIN_TYPES) {
    if (lower.includes(type)) {
      return { rawSpan: type, value: type, confidence: 0.8, status: "provisional", requiresConfirmation: true };
    }
  }
  return { rawSpan: "", value: null, confidence: 0, status: "requires_review", requiresConfirmation: true };
}

function detectConcentratedAmbiguity(clause: string): boolean {
  return /\b(?:concentrated|u-?(?:200|300|500))\b/i.test(clause);
}

function statedAmount(rawSpan: string, parsed: number): ExtractedValue<number> {
  return { rawSpan, value: parsed, confidence: 0.92, status: "provisional", requiresConfirmation: true };
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
  if (PLANNED_OR_COMMANDED.test(clause)) return null;
  if (/\b(?:ignore active insulin|active insulin|correction factor|insulin ratio|insulin duration|max bolus)\b/i.test(clause)) {
    return null;
  }
  if (DOSE_REQUEST_WITHOUT_ADMIN.test(clause) && !new RegExp(`\\b${ADMINISTRATION_VERB}\\b`, "i").test(clause)) {
    return null;
  }

  if (ABSENT_INSULIN.test(clause)) {
    return {
      amountUnits: { rawSpan: clause.match(ABSENT_INSULIN)![0], value: 0, confidence: 0.9, status: "provisional", requiresConfirmation: true },
      takenAt: missingTakenAt(),
      insulinType: detectInsulinType(clause),
      concentratedInsulinAmbiguity: false,
    };
  }

  const injected = clause.match(INJECTED_AMOUNT);
  const primed = clause.match(PRIMED_AMOUNT);
  const dialled = clause.match(DIALLED_AMOUNT);
  if (injected && (primed || dialled || /\bonly injected\b/i.test(clause))) {
    const parsed = parseQuantityToken(injected[1]!);
    if (parsed !== null) {
      const explicitTime = parseTimeExpression(clause, referenceNowMs);
      return {
        amountUnits: statedAmount(injected[0], parsed),
        takenAt: explicitTime.status === "missing" ? missingTakenAt() : explicitTime,
        insulinType: detectInsulinType(clause),
        concentratedInsulinAmbiguity: detectConcentratedAmbiguity(clause),
      };
    }
  }

  const hasAmountMatch = clause.match(AMOUNT_PATTERN) ?? clause.match(INSULIN_WAS_AMOUNT_PATTERN) ?? clause.match(NOUN_FIRST_AMOUNT);
  const hasNoAmountMention = MENTIONS_INSULIN_NO_AMOUNT.test(clause);
  const hasGeneralMention =
    MENTIONS_INSULIN_GENERAL.test(clause) ||
    SPILLED.test(clause) ||
    (/\bunits?\b/i.test(clause) && /\btook\b/i.test(clause)) ||
    /\b(?:primed|diall(?:ed|ed)|injected)\b/i.test(clause);

  if (!hasAmountMatch && !hasNoAmountMention && !hasGeneralMention && !injected) return null;

  let amountUnits: ExtractedValue<number>;
  if (hasAmountMatch) {
    const parsed = parseQuantityToken(hasAmountMatch[1]!);
    amountUnits =
      parsed === null
        ? missingAmount(hasAmountMatch[0])
        : statedAmount(hasAmountMatch[0], parsed);
  } else if (injected) {
    const parsed = parseQuantityToken(injected[1]!);
    amountUnits = parsed === null ? missingAmount(injected[0]) : statedAmount(injected[0], parsed);
  } else if (SPILLED.test(clause) || /\bsame dose\b/i.test(clause)) {
    amountUnits = { rawSpan: clause.match(/\bsame dose\b/i)?.[0] ?? "spilled", value: null, confidence: 0.2, status: "requires_review", requiresConfirmation: true };
  } else {
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
