import type { CaptureIntent, IntentClassification, ProposedNextStep } from "./capture-contract.js";
import { doseOrCorrectionRequestDetected } from "./acceptance-intent.js";
import { hasBlockingClarifications, type ProvisionalEvent } from "./types.js";

/**
 * Settings-parameter language. Natural language may notice this; it must
 * never apply it. Changing ICR/ISF/target/DIA/max dose requires the
 * dedicated settings screen and an explicit confirmed new version.
 */
const SETTINGS_LANGUAGE = /\b(?:change|update|set|adjust|edit|new)\b[\s\S]{0,48}\b(?:icr|isf|carb(?:ohydrate)?\s+ratio|insulin[- ]to[- ]carb(?:ohydrate)?(?:\s+ratio)?|sensitivity(?:\s+factor)?|correction\s+factor|target(?:\s+glucose)?|insulin\s+duration|dia\b|max(?:imum)?\s+dose|dose\s+increment|dose\s+cap)\b/i;
const SETTINGS_VALUE_LANGUAGE = /\b(?:my|the)\s+(?:new\s+)?(?:ratio|icr|isf|target(?:\s+glucose)?|carb(?:ohydrate)?\s+ratio|correction\s+factor)\s+(?:is|to|is\s+now|should\s+be|needs\s+to\s+be)\b/i;
const SETTINGS_ADVICE_LANGUAGE = /\bwhat should my (?:ratio|icr|isf|target|sensitivity|dose increment|max(?:imum)? dose)\b/i;
const SETTINGS_DURATION_VALUE = /\b(?:use|set)\s+\d+(?:\.\d+)?\s*(?:hour|hr)s?\s+insulin\s+duration\b/i;

/**
 * The user is asking for a dose. This package still does not answer with a
 * number. It only classifies the capture so the deterministic engine can
 * run after review and confirmation.
 */
const DOSE_REQUEST_LANGUAGE = /\b(?:how much(?: insulin)? should i (?:take|give|bolus|inject)|what(?:'s| is) my (?:dose|bolus)|calculate (?:a |my )?bolus|need a (?:correction|bolus)|give me a (?:dose|bolus))\b/i;

const GLUCOSE_LOG_LANGUAGE = /\b(?:log(?:ging)?|record(?:ing)?|saving|note(?:ing)?)\b[\s\S]{0,24}\b(?:glucose|bgl|bsl|sugar|reading)\b/i;

const EXCLUDED_SITUATIONS = new Set([
  "UNCONSCIOUS_OR_UNABLE_TO_SWALLOW",
  "PREGNANCY",
  "PAEDIATRIC_USE",
  "SEVERE_ILLNESS",
]);

function hasFood(event: ProvisionalEvent): boolean {
  return (event.meal?.components.length ?? 0) > 0 || event.userStatedCarbs?.value != null;
}

function hasGlucose(event: ProvisionalEvent): boolean {
  return event.glucose?.value.value !== null && event.glucose?.value.value !== undefined;
}

function hasInsulin(event: ProvisionalEvent): boolean {
  return event.recentInsulin !== null;
}

export function settingsLanguageDetected(originalText: string): boolean {
  return (
    SETTINGS_LANGUAGE.test(originalText) ||
    SETTINGS_VALUE_LANGUAGE.test(originalText) ||
    SETTINGS_ADVICE_LANGUAGE.test(originalText) ||
    SETTINGS_DURATION_VALUE.test(originalText)
  );
}

export function doseRequestLanguageDetected(originalText: string): boolean {
  const extra = doseOrCorrectionRequestDetected(originalText);
  return extra.dose || extra.correction || DOSE_REQUEST_LANGUAGE.test(originalText);
}

/**
 * Deterministic intent classification over the preserved source and the
 * structured extraction. This never invents a missing clinical value and
 * never returns a dose.
 */
export function classifyIntent(originalText: string, event: ProvisionalEvent): IntentClassification {
  const settings = settingsLanguageDetected(originalText);
  const doseRequest = doseRequestLanguageDetected(originalText);
  const reasons: string[] = [];

  const excluded = event.symptoms.specialSituations.filter((situation) => EXCLUDED_SITUATIONS.has(situation));
  if (excluded.length > 0) {
    reasons.push(`Excluded clinical context: ${excluded.join(", ")}.`);
    return {
      intent: "EMERGENCY_OR_EXCLUDED",
      confidence: 0.95,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: false,
    };
  }

  const food = hasFood(event);
  const glucose = hasGlucose(event);
  const insulin = hasInsulin(event);

  if (settings && !food && !glucose && !doseRequest) {
    reasons.push("The description asks to change or advise on treatment parameters.");
    return {
      intent: "SETTINGS_CHANGE_ATTEMPT",
      confidence: 0.93,
      reasons,
      settingsLanguageDetected: true,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: false,
    };
  }
  if (settings) {
    reasons.push("Settings language was detected and will not be applied from this capture.");
  }

  if (food && glucose) {
    reasons.push("Food and a glucose reading were both extracted.");
    if (doseRequest) reasons.push("Dose-request language is present; any preview must come from the deterministic engine after confirmation.");
    return {
      intent: "MEAL_BOLUS_CANDIDATE",
      confidence: doseRequest ? 0.9 : 0.86,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: true,
    };
  }

  if (food && !glucose) {
    reasons.push("Food was extracted without a glucose reading.");
    return {
      intent: "FOOD_ONLY",
      confidence: 0.84,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: true,
    };
  }

  if ((event.glucose?.qualitativeFlag || event.glucose?.ambiguousReason) && !food && !insulin) {
    reasons.push("Glucose language is present but the numeric reading is unresolved.");
    return {
      intent: "GLUCOSE_LOG",
      confidence: 0.55,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: false,
    };
  }

  if (glucose && !food) {
    if (GLUCOSE_LOG_LANGUAGE.test(originalText) && !doseRequest) {
      reasons.push("The wording looks like a glucose log rather than a dose request.");
      return {
        intent: "GLUCOSE_LOG",
        confidence: 0.8,
        reasons,
        settingsLanguageDetected: settings,
        doseRequestLanguageDetected: doseRequest,
        mayRunDeterministicPreview: true,
      };
    }
    reasons.push("A glucose reading was extracted without food.");
    if (doseRequest) reasons.push("Dose-request language is present; a correction preview still requires confirmation and the deterministic engine.");
    return {
      intent: "CORRECTION_CANDIDATE",
      confidence: doseRequest ? 0.88 : 0.78,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: true,
    };
  }

  if (insulin && !food && !glucose) {
    reasons.push("Only a prior insulin action was extracted.");
    return {
      intent: "PRIOR_INSULIN_RECORD",
      confidence: 0.82,
      reasons,
      settingsLanguageDetected: settings,
      doseRequestLanguageDetected: doseRequest,
      mayRunDeterministicPreview: false,
    };
  }

  reasons.push("No structured glucose, food, or insulin fields were extracted.");
  return {
    intent: "UNCLEAR",
    confidence: 0.4,
    reasons,
    settingsLanguageDetected: settings,
    doseRequestLanguageDetected: doseRequest,
    mayRunDeterministicPreview: false,
  };
}

export function proposedNextStepFor(
  classification: IntentClassification,
  event: ProvisionalEvent,
): ProposedNextStep {
  if (classification.intent === "EMERGENCY_OR_EXCLUDED") {
    return {
      kind: "SAFETY_REFUSAL",
      explanation:
        "This capture is preserved, but the app will not calculate a dose in an excluded or emergency context. Use your established plan or seek urgent help.",
    };
  }
  if (classification.intent === "SETTINGS_CHANGE_ATTEMPT") {
    return {
      kind: "SETTINGS_SCREEN_ONLY",
      explanation:
        "Your original words are saved. To change treatment parameters, open clinician-report settings and confirm a new immutable version. This screen cannot do that.",
    };
  }
  if (classification.intent === "UNCLEAR" || hasBlockingClarifications(event)) {
    return {
      kind: "CLARIFY",
      explanation: "Answer the blocking questions, or add the missing details, before any deterministic calculation can run.",
    };
  }
  if (classification.intent === "PRIOR_INSULIN_RECORD" && !classification.mayRunDeterministicPreview) {
    return {
      kind: "LOG_ONLY",
      explanation: "This capture can be kept as a prior-insulin record. It is not a new dose and will not run the calculator by itself.",
    };
  }
  if (classification.mayRunDeterministicPreview) {
    return {
      kind: "REVIEW_THEN_PREVIEW",
      explanation:
        "After you confirm every material value, the deterministic bolus module can produce a preview. This interpretation does not contain a dose.",
    };
  }
  return {
    kind: "LOG_ONLY",
    explanation: "This capture is saved for review. No calculation will run until a confirmed clinical draft exists.",
  };
}
