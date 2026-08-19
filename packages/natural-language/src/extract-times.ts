import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import type { ExtractedValue } from "./types.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

function confirmed(rawSpan: string, isoTimestamp: string, confidence: number): ExtractedValue<string> {
  return { rawSpan, value: isoTimestamp, confidence, status: "provisional", requiresConfirmation: true };
}

function missing(): ExtractedValue<string> {
  return { rawSpan: "", value: null, confidence: 0, status: "missing", requiresConfirmation: true };
}

/** A recognised but non-numeric time phrase. The UI must ask the user to set the actual time. */
function requiresTimeReview(rawSpan: string): ExtractedValue<string> {
  return { rawSpan, value: null, confidence: 0.35, status: "requires_review", requiresConfirmation: true };
}

/**
 * Parses a relative time expression ("two hours ago", "an hour ago", "10
 * minutes ago", "just now", "this morning") relative to `referenceNowMs`.
 * Returns null (not a guess) if the clause contains no time expression at
 * all - callers decide what "unstated" should default to.
 */
export function parseRelativeTime(clause: string, referenceNowMs: number): ExtractedValue<string> | null {
  if (/\bhalf\s+(?:an\s+)?hour\s+ago\b/i.test(clause)) {
    return confirmed("half an hour ago", new Date(referenceNowMs - 30 * MS_PER_MINUTE).toISOString(), 0.88);
  }

  const agoMatch = clause.match(
    new RegExp(`\\b(?:(about|around|roughly|approximately)\\s+)?(${QUANTITY_PATTERN})\\s*(hours?|hrs?|minutes?|mins?)\\s+ago\\b`, "i"),
  );
  if (agoMatch) {
    const amount = parseQuantityToken(agoMatch[2]!);
    if (amount === null) return null;
    const unit = agoMatch[3]!.toLowerCase();
    const isHours = unit.startsWith("h");
    const offsetMs = isHours ? amount * MS_PER_HOUR : amount * MS_PER_MINUTE;
    const iso = new Date(referenceNowMs - offsetMs).toISOString();
    const approximate = Boolean(agoMatch[1]);
    return approximate
      ? { rawSpan: agoMatch[0], value: iso, confidence: 0.6, status: "requires_review", requiresConfirmation: true }
      : confirmed(agoMatch[0], iso, 0.85);
  }

  const singularAgo = clause.match(/\ban?\s+(hour|minute)\s+ago\b/i);
  if (singularAgo) {
    const isHours = singularAgo[1]!.toLowerCase().startsWith("h");
    const offsetMs = isHours ? MS_PER_HOUR : MS_PER_MINUTE;
    const iso = new Date(referenceNowMs - offsetMs).toISOString();
    return confirmed(singularAgo[0], iso, 0.85);
  }

  if (/\bjust now\b/i.test(clause) || /\bright now\b/i.test(clause)) {
    return confirmed("now", new Date(referenceNowMs).toISOString(), 0.9);
  }

  const vagueTime = clause.match(/\b(?:this\s+morning|earlier(?:\s+today)?|a\s+little\s+while\s+ago|a\s+while\s+ago|before\s+(?:breakfast|lunch|dinner)|after\s+(?:breakfast|lunch|dinner))\b/i);
  if (vagueTime) return requiresTimeReview(vagueTime[0]);

  return null;
}

/**
 * Parses an absolute clock-time expression ("at one o'clock", "at 3pm", "at
 * 15:00") relative to the calendar date of `referenceNowMs`. Assumes the
 * most recent occurrence of that time is intended (i.e. today, or yesterday
 * if that clock time hasn't happened yet today) - this is a display
 * convenience for review, not a clinical inference, and the user reviews
 * the resolved timestamp before anything downstream uses it.
 */
export function parseAbsoluteClockTime(clause: string, referenceNowMs: number): ExtractedValue<string> | null {
  const clockMatch = clause.match(
    new RegExp(`\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\b`, "i"),
  );
  const wordClockMatch = clause.match(
    new RegExp(`\\bat\\s+(${QUANTITY_PATTERN})\\s+o'?clock\\b`, "i"),
  );

  let hour: number | null = null;
  let minute = 0;
  let rawSpan = "";

  if (clockMatch) {
    hour = Number(clockMatch[1]);
    minute = clockMatch[2] ? Number(clockMatch[2]) : 0;
    const meridiem = clockMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    rawSpan = clockMatch[0];
  } else if (wordClockMatch) {
    hour = parseQuantityToken(wordClockMatch[1]!);
    rawSpan = wordClockMatch[0];
  }

  if (hour === null || hour > 23) return null;

  const reference = new Date(referenceNowMs);
  const candidate = new Date(reference);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() > referenceNowMs) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return confirmed(rawSpan, candidate.toISOString(), clockMatch ? 0.8 : 0.65);
}

/** Tries relative time first, then absolute clock time. Returns "missing" status if neither is found. */
export function parseTimeExpression(clause: string, referenceNowMs: number): ExtractedValue<string> {
  return parseRelativeTime(clause, referenceNowMs) ?? parseAbsoluteClockTime(clause, referenceNowMs) ?? missing();
}
