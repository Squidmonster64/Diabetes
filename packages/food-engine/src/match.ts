/**
 * Shared food-identity ranking helpers. Products supply search candidates;
 * this module never talks to a database and never invents nutrition values.
 */
export const DENSITY_MEASURE_PATTERN = /density/i;
export const COUNTABLE_MEASURE_HINT =
  /\b(slice|piece|biscuit|item|roll|unit|each|bar|disc|round|rasher|medium|small|large|fruit|whole|tablespoon|teaspoon|tbsp|tsp|cup|packet)\b/i;

export const AUTO_ACCEPT_CONFIDENCE = 0.85;

export const CONFIDENCE_BY_MATCH_TYPE = {
  EXACT: 0.95,
  WHOLE_WORD: 0.85,
  PREFIX: 0.7,
  TOKEN: 0.55,
  SUBSTRING: 0.4,
} as const;

export function isStrongIdentityMatch(phrase: string, label: string): boolean {
  const query = phrase.trim().toLowerCase();
  const name = label.trim().toLowerCase();
  if (!query || !name) return false;
  if (name === query) return true;
  const firstSegment = name.split(",")[0]!.trim();
  if (firstSegment === query) return true;
  const queryTokens = query.split(/\s+/).filter((token) => token.length > 0);
  if (queryTokens.length < 2) return false;
  const head = name.split(",").slice(0, 2).join(" ");
  return queryTokens.every((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "u").test(head);
  });
}

export function measureHintFor(unit: string | null | undefined): RegExp {
  const normalised = (unit ?? "").toLowerCase();
  if (normalised === "slice" || normalised === "slices") return /\bslice\b/i;
  if (normalised === "tablespoon" || normalised === "tbsp") return /\b(tablespoon|tbsp)\b/i;
  if (normalised === "teaspoon" || normalised === "tsp") return /\b(teaspoon|tsp)\b/i;
  if (normalised === "cup" || normalised === "cups") return /\bcup\b/i;
  if (normalised === "packet" || normalised === "pack") return /\b(packet|pack)\b/i;
  if (normalised === "biscuit" || normalised === "weet-bix" || normalised === "weetbix") return /\b(biscuit|weet)\b/i;
  if (normalised === "whole" || normalised === "piece" || normalised === "item") {
    return /\b(medium|small|large|fruit|whole|each|item|piece|banana|biscuit)\b/i;
  }
  return COUNTABLE_MEASURE_HINT;
}

export interface CountableMeasure {
  readonly measureId: string;
  readonly measureDescription: string;
  readonly quantity: number;
  readonly gramAmount: number | null;
}

export function pickCountableMeasure(
  measures: readonly CountableMeasure[],
  unit: string | null | undefined,
): CountableMeasure | null {
  const quantityOne = measures.filter(
    (measure) => measure.quantity === 1 && measure.gramAmount !== null && !DENSITY_MEASURE_PATTERN.test(measure.measureDescription),
  );
  const unitHint = measureHintFor(unit);
  return (
    quantityOne.find((measure) => unitHint.test(measure.measureDescription)) ??
    quantityOne.find((measure) => COUNTABLE_MEASURE_HINT.test(measure.measureDescription)) ??
    quantityOne[0] ??
    null
  );
}

export function assumedPortionFromMeasure(measureDescription: string, unit: string | null | undefined): string | null {
  const normalised = (unit ?? "").toLowerCase();
  if ((normalised === "whole" || normalised === "piece" || !normalised) && /\bmedium\b/i.test(measureDescription)) {
    return "assumed medium";
  }
  if (/\bsmall\b/i.test(measureDescription) && normalised === "whole") return "assumed small";
  if (/\blarge\b/i.test(measureDescription) && normalised === "whole") return "assumed large";
  return null;
}

export function normalisedName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(?:my|the|a|an|usual)\s+/, "")
    .trim();
}

export function nameConfidence(candidateName: string, phrase: string): number {
  const name = normalisedName(candidateName);
  const query = normalisedName(phrase);
  if (!name || !query) return 0;
  if (name === query) return 1;
  if (name.length >= 4 && (name.includes(query) || query.includes(name))) return 0.65;
  return 0;
}
