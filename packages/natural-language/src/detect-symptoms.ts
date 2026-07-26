import type { SpecialSituation } from "@diabetes-companion/bolus";
import type { SymptomExtraction } from "./types.js";

/**
 * Keyword cues mapped onto the bolus module's own closed SpecialSituation
 * enum. This is a fixed, auditable lookup - it never adds a category the
 * handoff doesn't already define, and it never decides which situation
 * applies when the text is ambiguous; it only surfaces candidates for the
 * user (or the existing safety gates) to confirm.
 */
const SITUATION_KEYWORDS: ReadonlyArray<readonly [SpecialSituation, RegExp]> = [
  ["KETONES", /\bketones?\b/i],
  ["VOMITING", /\bvomit(?:ing|ed)?\b|\bthrowing up\b|\bthrew up\b/i],
  ["SICK_DAY", /\bsick\b|\bunwell\b|\bfever\b|\bflu\b/i],
  ["SEVERE_ILLNESS", /\bsevere(?:ly)?\s+ill\b|\bhospital\b/i],
  ["DEHYDRATION", /\bdehydrat(?:ed|ion)\b/i],
  ["PREGNANCY", /\bpregnant\b|\bpregnancy\b/i],
  ["EXERCISE_ADJUSTMENT", /\bexercis(?:e|ing|ed)\b|\bworkout\b|\bran\b|\brunning\b|\bgym\b/i],
  ["ALCOHOL_ADJUSTMENT", /\balcohol\b|\bdrank\b|\bdrinking\b|\bbeer\b|\bwine\b/i],
  ["STEROID_ADJUSTMENT", /\bsteroids?\b|\bprednisone\b|\bcortisone\b/i],
  ["PUMP_OR_AID", /\bpump\b|\bclosed\s+loop\b|\bomnipod\b|\btandem\b/i],
  ["BASAL_OR_PREMIXED_INSULIN", /\bbasal\b|\bpremixed\b|\blantus\b|\blevemir\b|\btresiba\b/i],
  ["UNCONSCIOUS_OR_UNABLE_TO_SWALLOW", /\bunconscious\b|\bcan'?t swallow\b|\bunable to swallow\b/i],
];

const HYPO_SYMPTOM_PATTERN =
  /\b(shaky|shaking|dizzy|dizziness|sweating|sweaty|confus(?:ed|ion)|hypo\b|hypoglyc(?:a?emi)?c?|feel(?:ing)?\s+low|light[\s-]?headed|trembl(?:ing|e))\b/i;

/**
 * Detects hypoglycaemia symptom language and known special-situation
 * keyword cues in text. Never invents a new clinical category and never
 * chooses between conflicting cues - all matches are surfaced together and
 * the existing bolus safety gates (which already handle SpecialSituation
 * conflicts, e.g. C-04) make any downstream decision.
 */
export function detectSymptoms(text: string): SymptomExtraction {
  const hypoSymptoms = HYPO_SYMPTOM_PATTERN.test(text);

  const specialSituations: SpecialSituation[] = [];
  const rawPhrases: string[] = [];

  for (const [situation, pattern] of SITUATION_KEYWORDS) {
    const match = text.match(pattern);
    if (match) {
      specialSituations.push(situation);
      rawPhrases.push(match[0]);
    }
  }

  const hypoMatch = text.match(HYPO_SYMPTOM_PATTERN);
  if (hypoMatch) {
    rawPhrases.push(hypoMatch[0]);
  }

  // Every entry in SITUATION_KEYWORDS is already typed against the closed
  // SpecialSituation union, so this array can never contain a value the
  // bolus module doesn't recognise - no runtime re-validation needed.
  return { hypoSymptoms, specialSituations, rawPhrases };
}
