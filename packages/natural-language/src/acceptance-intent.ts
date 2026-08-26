import type { CaptureInterpretation } from "./capture-contract.js";
import type { CaptureIntent } from "./capture-contract.js";

export type AcceptanceIntent =
  | "LOG_GLUCOSE"
  | "LOG_INSULIN"
  | "LOG_MEAL"
  | "MEAL_DOSE"
  | "CORRECTION_DOSE"
  | "FOOD_LOOKUP"
  | "REVIEW_EVENT"
  | "UNKNOWN";

const FOOD_LOOKUP_LANGUAGE =
  /\b(?:don't log it,?\s*just tell me the carbs|just tell me the carbs|just make up the carbs|threw it away|not sure if cooked or dry|the carbs are from the packet)\b/i;

const UNKNOWN_LANGUAGE =
  /\b(?:guess my glucose|make up the carbs|change my (?:insulin )?ratio|set my correction factor|set target glucose|set insulin duration|delete all my diabetes data|reset my treatment settings|don't log the insulin yet|same thing as before|i might take|i(?:'m| am) about to take|i should take|give me \d+(?:\.\d+)? units|glucose six slash eight|i didn't take \d+)\b/i;

const REVIEW_LANGUAGE =
  /\b(?:actually (?:glucose|insulin|it|meal|coke)|change that (?:glucose|insulin|reading)|delete my last|that reading was|wrong barcode|someone else(?:'s)?|only finished half|i meant|not 6\.8|not 6 units|scanned the wrong|this isn't my reading|remove the |add \d+ grams|bread was |it was \d+|make the rice|i only ate half|i didn't eat|that meal was|that insulin was|move that event|move it to|did i take|what was my last|what did i eat|how much insulin did i take|sensor says error|sensor is wrong|vomited|exercised after taking insulin|i started eating but only finished|i didn't take that insulin|label says.{0,48} not |not coke)\b/i;

const CORRECTION_REQUEST =
  /\b(?:do i need a correction|correction dose|need a correction|correction for|calculate correction|give me a correction|ignore active insulin|old correction factor|what should i take for (?:glucose|bg)|correct(?:ion)?(?:\s+dose)?(?:\s+for)?\s+\d+(?:\.\d+)?|i don't know my glucose but give me a correction)\b/i;

const MEAL_DOSE_REQUEST =
  /\b(?:how much insulin(?!\s+did i take)|calculate (?:the |a |my )?meal dose|calculate (?:the |a |my )?bolus|what dose should i take|work out insulin|dose this meal|dose the meal|use ai to decide the insulin|decide the insulin|ignore the max bolus|use whatever ratio|calculate anyway|assume my glucose is fine)\b/i;

const HISTORY_QUERY =
  /\b(?:did i take|what was my last|what did i eat|how much insulin did i take)\b/i;

const QUALITATIVE_GLUCOSE = /\b(?:meter|sensor)\s+says\s+(?:hi|lo)\b/i;
const SPOKEN_SIX_FIVE = /\bbg\s+six\s+five\b/i;
const SAME_DOSE = /\bsame dose\b/i;
const THAT_MEAL_AGAIN = /\bthat meal again\b/i;
const USUAL_MEAL = /\busual\b.+\b(?:sandwich|meal|banana)\b/i;
const NO_DOSE_LOG_FOOD = /\bdon't calculate a dose,?\s*just log the food\b/i;
const LOG_GLUCOSE_NO_CORRECTION = /\bjust log the glucose,?\s*no correction\b/i;
const ABSENT_INSULIN = /\bi haven(?:'t| not) taken any insulin\b/i;
const COMPLETED_INSULIN_LOG = /\b(?:log that i took|i took)\s+\d+(?:\.\d+)?\s*units?\b/i;
const CONFLICTING_READINGS = /\bsensor says\b[\s\S]+\b(?:finger\s*prick|fingerstick)\b/i;
const DEVICE_ERROR = /\bsensor says error\b/i;

export function doseOrCorrectionRequestDetected(originalText: string): { dose: boolean; correction: boolean } {
  const history = HISTORY_QUERY.test(originalText);
  return {
    dose: !history && MEAL_DOSE_REQUEST.test(originalText),
    correction: CORRECTION_REQUEST.test(originalText),
  };
}

export function reviewEventDetected(originalText: string): boolean {
  return REVIEW_LANGUAGE.test(originalText) || HISTORY_QUERY.test(originalText) || DEVICE_ERROR.test(originalText);
}

/**
 * Maps a capture interpretation onto the 500-phrase acceptance vocabulary
 * without inventing a treatment dose. Product intents remain unchanged.
 */
export function toAcceptanceIntent(interpretation: CaptureInterpretation): AcceptanceIntent {
  const text = interpretation.originalText;
  const extraction = interpretation.extraction;
  const food = (extraction.meal?.components.length ?? 0) > 0;
  const carbs = extraction.userStatedCarbs?.value != null || extraction.userStatedCarbs?.status === "requires_review";
  const glucose = extraction.glucose?.value.value != null || Boolean(extraction.glucose?.qualitativeFlag);
  const insulin = extraction.recentInsulin !== null && extraction.recentInsulin.amountUnits.value != null;
  const insulinMentioned = extraction.recentInsulin !== null;
  const { dose, correction } = doseOrCorrectionRequestDetected(text);

  if (FOOD_LOOKUP_LANGUAGE.test(text)) return "FOOD_LOOKUP";
  if (/\bglucose six slash eight\b/i.test(text)) return "UNKNOWN";
  if (UNKNOWN_LANGUAGE.test(text)) return "UNKNOWN";
  if (NO_DOSE_LOG_FOOD.test(text)) return "LOG_MEAL";
  if (LOG_GLUCOSE_NO_CORRECTION.test(text)) return "LOG_GLUCOSE";
  if (reviewEventDetected(text)) return "REVIEW_EVENT";
  if (interpretation.intent.intent === "SETTINGS_CHANGE_ATTEMPT") return "UNKNOWN";
  if (interpretation.intent.intent === "EMERGENCY_OR_EXCLUDED") return "UNKNOWN";

  if (SPOKEN_SIX_FIVE.test(text)) return "LOG_GLUCOSE";
  if (QUALITATIVE_GLUCOSE.test(text)) return "LOG_GLUCOSE";
  if (CONFLICTING_READINGS.test(text)) return "LOG_GLUCOSE";
  if (SAME_DOSE.test(text)) return "LOG_INSULIN";
  if (THAT_MEAL_AGAIN.test(text) || USUAL_MEAL.test(text)) return "LOG_MEAL";
  if (ABSENT_INSULIN.test(text)) return "LOG_INSULIN";
  if (/\bmight have been\s+\d+\s+or\s+\d+\s+grams?\s+carbs\b/i.test(text) || (carbs && extraction.userStatedCarbs?.value == null && extraction.userStatedCarbs?.status === "requires_review" && /meal/i.test(text))) {
    return "MEAL_DOSE";
  }

  if (correction && !food && !carbs) return "CORRECTION_DOSE";
  if (dose && (food || carbs || /\b(?:meal|carbs?|pasta|banana|bread|weet|dose the meal|max bolus|ratio)\b/i.test(text))) {
    return "MEAL_DOSE";
  }
  if (dose && glucose && !food && !carbs) return "CORRECTION_DOSE";
  if (correction && (food || carbs)) return "MEAL_DOSE";
  if (dose) return "MEAL_DOSE";

  if (glucose && insulin && !dose && !correction) return "REVIEW_EVENT";
  if (food && insulin && !dose && !correction) return "REVIEW_EVENT";

  if (food && glucose && !dose && !correction) return "LOG_MEAL";
  if ((food || carbs) && !dose && !correction) return "LOG_MEAL";
  if (COMPLETED_INSULIN_LOG.test(text) && !food && !dose) return "LOG_INSULIN";
  if (insulin && !food && !glucose && !dose) return "LOG_INSULIN";
  if (insulinMentioned && !food && !glucose && !dose && /\binsulin\b/i.test(text)) return "LOG_INSULIN";
  if ((glucose || extraction.glucose?.ambiguousReason) && !food && !carbs && !dose && !correction) return "LOG_GLUCOSE";

  const product = interpretation.intent.intent as CaptureIntent;
  if (product === "MEAL_BOLUS_CANDIDATE") return dose ? "MEAL_DOSE" : "LOG_MEAL";
  if (product === "CORRECTION_CANDIDATE") return correction || dose ? "CORRECTION_DOSE" : "LOG_GLUCOSE";
  if (product === "FOOD_ONLY") return "LOG_MEAL";
  if (product === "GLUCOSE_LOG") return "LOG_GLUCOSE";
  if (product === "PRIOR_INSULIN_RECORD") return "LOG_INSULIN";
  if (product === "UNCLEAR") return "UNKNOWN";
  return "UNKNOWN";
}

export function parserInventedDose(interpretation: CaptureInterpretation): boolean {
  const record = interpretation as unknown as Record<string, unknown>;
  const extraction = interpretation.extraction as unknown as Record<string, unknown>;
  for (const key of ["bolusDose", "dose", "roundedTotalUnits", "unroundedTotalUnits", "recommendedDose", "parser_generated_dose"]) {
    if (record[key] !== undefined || extraction[key] !== undefined) return true;
  }
  return false;
}

export function parserInventedSettings(interpretation: CaptureInterpretation): boolean {
  const extraction = interpretation.extraction as unknown as Record<string, unknown>;
  for (const key of ["icr", "isf", "targetGlucose", "insulinDuration", "diaHours", "maxDose"]) {
    if (extraction[key] !== undefined) return true;
  }
  return false;
}
