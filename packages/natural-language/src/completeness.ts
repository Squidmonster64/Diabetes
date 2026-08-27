import type { CompletenessResult, SemanticEvent } from "./semantic-events.js";

const MEANINGFUL_PATTERNS: readonly RegExp[] = [
  /\bblood glucose\b/i,
  /\bglucose\b/i,
  /\bnauseous\b/i,
  /\bshaky\b/i,
  /\bdizzy\b/i,
  /\bvomit(?:ing|ed)?\b/i,
  /\bshort acting\b/i,
  /\bnovorapid\b/i,
  /\bcheese sandwich\b/i,
  /\bsandwich\b/i,
  /\bten minutes ago\b/i,
  /\bfour hours ago\b/i,
  /\b\d+(?:\.\d+)?\s*units?\b/i,
  /\b\d+(?:\.\d+)?\s*(?:mmol(?:\/l)?|mg\/dl)\b/i,
];

function eventHaystack(events: readonly SemanticEvent[]): string {
  return events
    .map((event) =>
      [
        event.originalFragment,
        event.mealDescription,
        event.symptom,
        event.insulinType,
        event.relativeTime,
        event.glucoseValue,
        event.insulinAmountUnits,
        event.foods.map((item) => `${item.foodName} ${item.originalFragment}`).join(" "),
      ].join(" "),
    )
    .join(" ")
    .toLowerCase();
}

/**
 * Source-to-meaning completeness: every clinically meaningful fragment must
 * land on an event, an unresolved field, or an explicit missing-fragment list.
 */
export function validateSemanticCompleteness(originalText: string, events: readonly SemanticEvent[]): CompletenessResult {
  const haystack = `${eventHaystack(events)} ${events.flatMap((event) => event.unresolvedFields).join(" ")}`.toLowerCase();
  const accountedFragments: string[] = [];
  const missingFragments: string[] = [];

  for (const pattern of MEANINGFUL_PATTERNS) {
    const match = originalText.match(pattern);
    if (!match) continue;
    const fragment = match[0]!;
    const needle = fragment.toLowerCase();
    if (haystack.includes(needle) || haystack.includes(needle.replace(/-/g, " "))) {
      accountedFragments.push(fragment);
    } else {
      missingFragments.push(fragment);
    }
  }

  const numbers = originalText.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const number of numbers) {
    if (/\b\d{1,2}:\d{2}\b/.test(originalText) && originalText.includes(`${number}:`)) continue;
    if (haystack.includes(number) || events.some((event) => String(event.glucoseValue) === number || String(event.insulinAmountUnits) === number)) {
      if (!accountedFragments.includes(number)) accountedFragments.push(number);
    } else if (!missingFragments.includes(number)) {
      missingFragments.push(number);
    }
  }

  const valid = missingFragments.length === 0;
  return {
    valid,
    accountedFragments,
    missingFragments,
    interpretationStatus: valid ? "COMPLETE" : "INCOMPLETE",
  };
}
