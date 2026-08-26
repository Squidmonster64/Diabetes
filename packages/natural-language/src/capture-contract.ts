/**
 * Versioned capture/interpretation contract for the Diabetes product.
 *
 * This is the Fragments-style interaction model adapted to a standalone
 * clinical product: preserve the source, keep interpretation separate, and
 * never let language invent a treatment calculation. The deterministic
 * bolus module remains the only authority for dose arithmetic.
 */
import { hasBlockingClarifications, type ProvisionalEvent } from "./types.js";
import type { LanguageProvenance } from "./semantic-events.js";

export const CAPTURE_CONTRACT_VERSION = "v1";
export const ORIGINATING_APP = "diabetes-companion";

export type CaptureSourceType = "typed" | "voice";

/**
 * Closed intent set. This is not a chatbot routing table: every value
 * either leads to review/clarification, a deterministic preview, a
 * documented refusal path, or an explicit non-calculation destination
 * (settings screen). Nothing here produces a dose.
 */
export type CaptureIntent =
  | "MEAL_BOLUS_CANDIDATE"
  | "CORRECTION_CANDIDATE"
  | "FOOD_ONLY"
  | "GLUCOSE_LOG"
  | "PRIOR_INSULIN_RECORD"
  | "SETTINGS_CHANGE_ATTEMPT"
  | "EMERGENCY_OR_EXCLUDED"
  | "UNCLEAR";

export type InterpretationStatus =
  | "DRAFT"
  | "NEEDS_CLARIFICATION"
  | "ACCEPTED"
  | "REJECTED"
  | "ACTIONED";

export type CaptureActionType =
  | "INTERPRETATION_CREATED"
  | "INTERPRETATION_REVISED"
  | "INTERPRETATION_ACCEPTED"
  | "INTERPRETATION_REJECTED"
  | "BOLUS_PREVIEW"
  | "BOLUS_CONFIRMED"
  | "BOLUS_REJECTED"
  | "ADMINISTRATION_RECORDED"
  | "SAFETY_REFUSAL"
  | "SETTINGS_REDIRECT";

export type ProposedNextStepKind =
  | "REVIEW_THEN_PREVIEW"
  | "SAFETY_REFUSAL"
  | "SETTINGS_SCREEN_ONLY"
  | "CLARIFY"
  | "LOG_ONLY";

export interface IntentClassification {
  readonly intent: CaptureIntent;
  readonly confidence: number;
  readonly reasons: readonly string[];
  /** True when the original words also mentioned treatment-parameter changes. Never applied from this capture. */
  readonly settingsLanguageDetected: boolean;
  /** True when dose-request language was present. Still never answered by this package. */
  readonly doseRequestLanguageDetected: boolean;
  readonly mayRunDeterministicPreview: boolean;
}

export interface ProposedNextStep {
  readonly kind: ProposedNextStepKind;
  readonly explanation: string;
}

export interface CaptureInterpretation {
  readonly contractVersion: typeof CAPTURE_CONTRACT_VERSION;
  readonly originatingApp: typeof ORIGINATING_APP;
  readonly originalText: string;
  readonly normalisedText: string;
  readonly referenceNow: string;
  readonly intent: IntentClassification;
  readonly extraction: ProvisionalEvent;
  readonly proposedNextStep: ProposedNextStep;
  readonly languageProvenance?: LanguageProvenance;
}

export function interpretationStatusFor(interpretation: CaptureInterpretation): InterpretationStatus {
  if (hasBlockingClarifications(interpretation.extraction) || interpretation.proposedNextStep.kind === "CLARIFY") {
    return "NEEDS_CLARIFICATION";
  }
  return "DRAFT";
}

export function intentCopy(intent: CaptureIntent): { title: string; body: string } {
  switch (intent) {
    case "MEAL_BOLUS_CANDIDATE":
      return {
        title: "Meal-time calculation candidate",
        body: "This looks like food plus glucose. Review every extracted value. A dose can be calculated only by the deterministic engine after you confirm.",
      };
    case "CORRECTION_CANDIDATE":
      return {
        title: "Correction calculation candidate",
        body: "This looks like a glucose reading without a meal. Review it. A correction preview can run only after you confirm, using the same deterministic rules as a typed entry.",
      };
    case "FOOD_ONLY":
      return {
        title: "Food description",
        body: "Food was described without a glucose reading. Review the food details. A calculation still needs a confirmed glucose value.",
      };
    case "GLUCOSE_LOG":
      return {
        title: "Glucose log",
        body: "This looks like a glucose record rather than a dose request. The original words are saved. A correction preview is optional after review.",
      };
    case "PRIOR_INSULIN_RECORD":
      return {
        title: "Prior insulin record",
        body: "This looks like insulin already taken. The amount is a candidate only. It is never treated as active insulin or as a new dose.",
      };
    case "SETTINGS_CHANGE_ATTEMPT":
      return {
        title: "Settings change is not allowed from a description",
        body: "Treatment parameters can only be changed on the clinician-report settings screen, as a new immutable version you confirm. This capture keeps your original words and will not alter ICR, ISF, target, duration, or dose limits.",
      };
    case "EMERGENCY_OR_EXCLUDED":
      return {
        title: "Excluded or emergency context",
        body: "This description includes an excluded clinical situation. The app will not invent treatment. Follow your established emergency, hypo, or sick-day plan, or seek urgent help.",
      };
    case "UNCLEAR":
      return {
        title: "Needs clarification",
        body: "The description is not specific enough for a structured clinical draft. Your original words are saved. Add the missing glucose, food, or insulin details, or type them on the review screen.",
      };
  }
}
