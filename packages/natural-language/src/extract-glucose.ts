import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import { parseTimeExpression } from "./extract-times.js";
import type { ExtractedValue, GlucoseExtraction, GlucoseUnit } from "./types.js";

/**
 * Clinical-reading cues only. A food mention such as "sugar in my coffee"
 * cannot match because every form below requires a neighbouring stated value.
 */
const GLUCOSE_CUE = "(?:blood\\s+glucose|blood\\s+sugar|glucose|sugars?|bgl|bsl|bg|cgm|sensor|my\\s+(?:blood\\s+)?sugar|my\\s+(?:reading|level)|(?:blood\\s+)?level|(?:glucose\\s+)?reading)";
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
const IM_NUMBER_PATTERN = new RegExp(`\\bi(?:'m|\\s+am)\\s+(${QUANTITY_PATTERN})\\b`, "i");
const CORRECT_NUMBER_PATTERN = new RegExp(
  `\\b(?:correct(?:ion)?(?:\\s+dose)?(?:\\s+for)?|correction\\s+dose\\s+for)\\s+(${QUANTITY_PATTERN})\\b`,
  "i",
);
const FOR_GLUCOSE_PATTERN = new RegExp(`\\bfor\\s+(?:glucose|bg)\\s+(${QUANTITY_PATTERN})\\b`, "i");
const NUMBER_THEN_GLUCOSE = new RegExp(`\\b(${QUANTITY_PATTERN})\\s+glucose\\b`, "i");
const AND_GLUCOSE_PATTERN = new RegExp(`\\band\\s+(?:glucose|bg|bgl)\\s+(${QUANTITY_PATTERN})\\b`, "i");
const METER_QUALITATIVE = /\b(?:(?:the\s+)?(?:meter|sensor)\s+says|glucose\s+reads)\s+(hi|lo)\b/i;
const READING_LOW_ON_METER = /\breading\s+low\s+on\s+the\s+meter\b/i;
const I_WAS_READING = new RegExp(`\\bi\\s+was\\s+(${QUANTITY_PATTERN})\\b`, "i");
const SPOKEN_SIX_FIVE = /\bbg\s+six\s+five\b/i;
const SLASH_AMBIGUOUS = /\bglucose\s+six\s+slash\s+eight\b/i;
const CONFLICTING_METERS =
  /\b(?:sensor|meter)\s+says\s+(\d+(?:\.\d+)?)[\s\S]{0,80}?\b(?:finger\s*prick|fingerstick)\s+(?:says\s+)?(\d+(?:\.\d+)?)/i;
const ONE_TWENTY = /\b(one|two)\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\s+glucose\b/i;

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

function withTimestamp(
  clause: string,
  referenceNowMs: number,
  value: ExtractedValue<number>,
  extra?: Pick<GlucoseExtraction, "qualitativeFlag" | "ambiguousReason">,
): GlucoseExtraction {
  const unit = detectUnit(clause);
  const explicitTime = parseTimeExpression(clause, referenceNowMs);
  const timestamp: ExtractedValue<string> =
    explicitTime.status === "missing"
      ? {
          rawSpan: "",
          value: extra?.ambiguousReason || extra?.qualitativeFlag ? null : new Date(referenceNowMs).toISOString(),
          confidence: extra?.ambiguousReason || extra?.qualitativeFlag ? 0 : 0.6,
          status: extra?.ambiguousReason || extra?.qualitativeFlag ? "missing" : "provisional",
          requiresConfirmation: true,
        }
      : explicitTime;
  return { value, unit, timestamp, qualitativeFlag: extra?.qualitativeFlag ?? null, ambiguousReason: extra?.ambiguousReason ?? null };
}

function numericValue(rawSpan: string, numeric: number, confidence: number, status: ExtractedValue<number>["status"]): ExtractedValue<number> {
  return { rawSpan, value: numeric, confidence, status, requiresConfirmation: true };
}

function correctionOrDoseContext(clause: string): boolean {
  return /\b(?:correction|correct(?:ing)?|dose|insulin)\b/i.test(clause);
}

/**
 * Extracts a current-glucose candidate from a clause. A numeric value is
 * never reinterpreted by its size: when no stated unit exists, the review UI
 * asks for one. Weakly contextual forms such as a bare "8.4 mmol/l" are
 * intentionally labelled `requires_review` despite containing an explicit
 * unit, so the patient sees what was understood before proceeding.
 */
export function extractGlucose(clause: string, referenceNowMs: number): GlucoseExtraction | null {
  if (SPOKEN_SIX_FIVE.test(clause)) {
    const match = clause.match(SPOKEN_SIX_FIVE)!;
    return withTimestamp(
      clause,
      referenceNowMs,
      { rawSpan: match[0], value: null, confidence: 0.2, status: "requires_review", requiresConfirmation: true },
      { ambiguousReason: "Spoken BG six five could be 6.5 or 65. Confirm the number and unit." },
    );
  }

  if (SLASH_AMBIGUOUS.test(clause)) {
    const match = clause.match(SLASH_AMBIGUOUS)!;
    return withTimestamp(
      clause,
      referenceNowMs,
      { rawSpan: match[0], value: null, confidence: 0.1, status: "requires_review", requiresConfirmation: true },
      { ambiguousReason: "Slash-separated digits are ambiguous (6/8 vs 6.8). Confirm the reading." },
    );
  }

  const conflicting = clause.match(CONFLICTING_METERS);
  if (conflicting) {
    return withTimestamp(
      clause,
      referenceNowMs,
      { rawSpan: conflicting[0], value: null, confidence: 0.2, status: "requires_review", requiresConfirmation: true },
      { ambiguousReason: `Sensor ${conflicting[1]} and finger prick ${conflicting[2]} disagree. Which reading should be logged?` },
    );
  }

  const qualitative = clause.match(METER_QUALITATIVE);
  if (qualitative) {
    const flag = qualitative[1]!.toUpperCase() as "HI" | "LO";
    return withTimestamp(
      clause,
      referenceNowMs,
      { rawSpan: qualitative[0], value: null, confidence: 0.4, status: "requires_review", requiresConfirmation: true },
      { qualitativeFlag: flag },
    );
  }

  if (READING_LOW_ON_METER.test(clause)) {
    return withTimestamp(
      clause,
      referenceNowMs,
      { rawSpan: clause.match(READING_LOW_ON_METER)![0], value: null, confidence: 0.4, status: "requires_review", requiresConfirmation: true },
      { qualitativeFlag: "LO" },
    );
  }

  const oneTwenty = clause.match(ONE_TWENTY);
  if (oneTwenty) {
    const tens: Record<string, number> = {
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
    };
    const hundreds: Record<string, number> = { one: 100, two: 200 };
    const ones: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
    };
    const numeric = (hundreds[oneTwenty[1]!.toLowerCase()] ?? 0) + (tens[oneTwenty[2]!.toLowerCase()] ?? 0) + (oneTwenty[3] ? ones[oneTwenty[3].toLowerCase()] ?? 0 : 0);
    return withTimestamp(clause, referenceNowMs, numericValue(oneTwenty[0], numeric, 0.75, "requires_review"));
  }

  const direct = clause.match(CUE_VALUE_PATTERN);
  const readingOf = !direct ? clause.match(READING_OF_VALUE_PATTERN) : null;
  const sittingAt = !direct && !readingOf ? clause.match(SITTING_AT_VALUE_PATTERN) : null;
  const lowOrHigh = !direct && !readingOf && !sittingAt ? clause.match(LOW_AT_PATTERN) : null;
  const pronounWithUnit = !direct && !readingOf && !sittingAt && !lowOrHigh ? clause.match(PRONOUN_WITH_UNIT_PATTERN) : null;
  const explicitUnit = !direct && !readingOf && !sittingAt && !lowOrHigh && !pronounWithUnit ? clause.match(EXPLICIT_UNIT_VALUE_PATTERN) : null;
  const andGlucose = !direct && !readingOf && !sittingAt && !lowOrHigh && !pronounWithUnit && !explicitUnit ? clause.match(AND_GLUCOSE_PATTERN) : null;
  const forGlucose = !direct && !andGlucose ? clause.match(FOR_GLUCOSE_PATTERN) : null;
  const correctNumber =
    !direct && !andGlucose && !forGlucose && correctionOrDoseContext(clause) ? clause.match(CORRECT_NUMBER_PATTERN) : null;
  const imNumber =
    !direct && !andGlucose && !forGlucose && !correctNumber && correctionOrDoseContext(clause) ? clause.match(IM_NUMBER_PATTERN) : null;
  const trailingGlucose = !direct && !andGlucose && !forGlucose && !correctNumber && !imNumber ? clause.match(NUMBER_THEN_GLUCOSE) : null;
  const iWas = !direct && !trailingGlucose ? clause.match(I_WAS_READING) : null;

  const valueMatch =
    direct ?? readingOf ?? sittingAt ?? lowOrHigh ?? pronounWithUnit ?? explicitUnit ?? andGlucose ?? forGlucose ?? correctNumber ?? imNumber ?? trailingGlucose ?? iWas;

  if (!valueMatch) return null;

  const rawNumberSpan = valueMatch[1]!;
  const numeric = parseQuantityToken(rawNumberSpan);
  if (numeric === null || !Number.isFinite(numeric)) return null;

  const lowSignal = Boolean(pronounWithUnit || explicitUnit || imNumber || correctNumber);
  const value: ExtractedValue<number> = {
    rawSpan: valueMatch[0],
    value: numeric,
    confidence: direct || readingOf || andGlucose || forGlucose ? 0.92 : sittingAt || lowOrHigh ? 0.85 : 0.65,
    status: lowSignal ? "requires_review" : "provisional",
    requiresConfirmation: true,
  };

  return withTimestamp(clause, referenceNowMs, value);
}

export { missingNumber as glucoseValueMissing };
