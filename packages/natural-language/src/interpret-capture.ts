import { classifyIntent, proposedNextStepFor } from "./classify-intent.js";
import { CAPTURE_CONTRACT_VERSION, ORIGINATING_APP, type CaptureInterpretation } from "./capture-contract.js";
import { generateClarifications, applyCorrections } from "./ambiguity.js";
import { parsedMealToExtraction } from "./extract-foods.js";
import { segmentEvent } from "./segment-event.js";
import { mergeSemanticEvents } from "./extract-semantic-events.js";
import { validateSemanticCompleteness } from "./completeness.js";
import { SEMANTIC_PARSER_VERSION, type LanguageProvenance, type SemanticEvent } from "./semantic-events.js";
import type {
  GlucoseExtraction,
  GlucoseUnit,
  InsulinExtraction,
  MealExtraction,
  ParsedMeal,
  ProvisionalEvent,
} from "./types.js";

function assertNoTreatmentInvention(interpretation: CaptureInterpretation): void {
  const record = interpretation as unknown as Record<string, unknown>;
  const extraction = interpretation.extraction as unknown as Record<string, unknown>;
  for (const key of ["bolusDose", "dose", "roundedTotalUnits", "unroundedTotalUnits", "recommendedDose"]) {
    if (record[key] !== undefined || extraction[key] !== undefined) {
      throw new Error("Capture interpretation must not carry a treatment dose.");
    }
  }
}

/**
 * Capture → preserve source → normalise → classify intent → extract
 * structured fields → check material ambiguity. The returned draft is
 * review-only. It never calculates a bolus.
 */
export function interpretCapture(originalText: string, referenceNowMs: number): CaptureInterpretation {
  const extraction = segmentEvent(originalText, referenceNowMs);
  const intent = classifyIntent(originalText, extraction);
  const interpretation: CaptureInterpretation = {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    originatingApp: ORIGINATING_APP,
    originalText: extraction.originalText,
    normalisedText: extraction.normalisedText,
    referenceNow: extraction.referenceNow,
    intent,
    extraction,
    proposedNextStep: proposedNextStepFor(intent, extraction),
    languageProvenance: {
      parseSource: "deterministic",
      model: null,
      promptVersion: "deterministic-only",
      schemaVersion: SEMANTIC_PARSER_VERSION,
      parserVersion: SEMANTIC_PARSER_VERSION,
      interpretedAt: new Date(referenceNowMs).toISOString(),
      fallback: false,
    },
  };
  assertNoTreatmentInvention(interpretation);
  return interpretation;
}

/**
 * Rebuilds clarifications and intent after a human edits extracted fields.
 * The original source text is forced back to the preserved capture text so
 * a revision can never rewrite what was said.
 */
export function reviseInterpretation(
  preservedOriginalText: string,
  extraction: ProvisionalEvent,
  referenceNowMs: number,
): CaptureInterpretation {
  const meal = extraction.meal as MealExtraction | null;
  const { meal: correctedMeal, correctionsApplied } = applyCorrections(preservedOriginalText, meal);
  const nextExtraction: ProvisionalEvent = {
    ...extraction,
    originalText: preservedOriginalText,
    meal: correctedMeal,
    correctionsApplied: [...extraction.correctionsApplied, ...correctionsApplied],
    clarifications: generateClarifications({
      glucose: extraction.glucose,
      recentInsulin: extraction.recentInsulin,
      meal: correctedMeal,
      userStatedCarbs: extraction.userStatedCarbs,
    }),
    referenceNow: new Date(referenceNowMs).toISOString(),
    mealPipeline: correctedMeal
      ? {
          rawInput: preservedOriginalText,
          mealText: correctedMeal.parsedMeal.mealText,
          parsedMeal: correctedMeal.parsedMeal,
          parseSource: correctedMeal.parsedMeal.parseSource,
          completenessValid: correctedMeal.parsedMeal.completeness.valid,
          confidenceGate: correctedMeal.parsedMeal.confidenceGate,
        }
      : extraction.mealPipeline,
  };
  const intent = classifyIntent(preservedOriginalText, nextExtraction);
  const interpretation: CaptureInterpretation = {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    originatingApp: ORIGINATING_APP,
    originalText: preservedOriginalText,
    normalisedText: nextExtraction.normalisedText,
    referenceNow: nextExtraction.referenceNow,
    intent,
    extraction: nextExtraction,
    proposedNextStep: proposedNextStepFor(intent, nextExtraction),
  };
  assertNoTreatmentInvention(interpretation);
  return interpretation;
}

function sourceMentionsNumber(originalText: string, value: number): boolean {
  const text = originalText.replace(/,/g, ".");
  const exact = Number.isInteger(value) ? String(value) : String(value);
  if (text.includes(exact)) return true;
  if (Number.isInteger(value) && new RegExp(`\\b${value}\\b`).test(text)) return true;
  return false;
}

function glucoseUnitFromLanguage(unit: string | null): GlucoseUnit | null {
  if (!unit) return null;
  const normalised = unit.toLowerCase().replace(/\s+/g, "");
  if (normalised.includes("mmol")) return "MMOL_L";
  if (normalised.includes("mg/dl") || normalised.includes("mgdl")) return "MG_DL";
  return null;
}

export interface LanguageEventOverlay {
  readonly glucose?: { readonly value: number; readonly unit: string | null; readonly rawSpan: string } | null;
  readonly recentInsulin?: { readonly amountUnits: number; readonly insulinType: string | null; readonly rawSpan: string } | null;
}

/**
 * Fills glucose or prior-insulin fields only when the deterministic parser
 * missed them and the stated number actually appears in the source text.
 * Never overwrites a deterministic extraction. Never invents a treatment dose.
 */
export function overlayLanguageEvent(
  interpretation: CaptureInterpretation,
  overlay: LanguageEventOverlay,
): CaptureInterpretation {
  let extraction: ProvisionalEvent = interpretation.extraction;
  const originalText = interpretation.originalText;

  if (extraction.glucose?.value.value == null && overlay.glucose && sourceMentionsNumber(originalText, overlay.glucose.value)) {
    const unitValue = glucoseUnitFromLanguage(overlay.glucose.unit);
    const unitInSource = overlay.glucose.unit ? originalText.toLowerCase().includes(overlay.glucose.unit.toLowerCase()) || Boolean(unitValue && /mmol|mg\s*\/\s*dl/i.test(originalText)) : false;
    const glucose: GlucoseExtraction = {
      value: {
        rawSpan: overlay.glucose.rawSpan || originalText,
        value: overlay.glucose.value,
        confidence: 0.7,
        status: "requires_review",
        requiresConfirmation: true,
      },
      unit: {
        rawSpan: unitValue && unitInSource ? overlay.glucose.unit ?? "" : "",
        value: unitValue && unitInSource ? unitValue : null,
        confidence: unitValue && unitInSource ? 0.7 : 0,
        status: unitValue && unitInSource ? "requires_review" : "missing",
        requiresConfirmation: true,
      },
      timestamp: extraction.glucose?.timestamp ?? {
        rawSpan: "",
        value: interpretation.referenceNow,
        confidence: 0.5,
        status: "provisional",
        requiresConfirmation: true,
      },
    };
    extraction = { ...extraction, glucose };
  }

  if (
    (!extraction.recentInsulin || extraction.recentInsulin.amountUnits.value === null) &&
    overlay.recentInsulin &&
    sourceMentionsNumber(originalText, overlay.recentInsulin.amountUnits)
  ) {
    const recentInsulin: InsulinExtraction = {
      amountUnits: {
        rawSpan: overlay.recentInsulin.rawSpan || originalText,
        value: overlay.recentInsulin.amountUnits,
        confidence: 0.7,
        status: "requires_review",
        requiresConfirmation: true,
      },
      takenAt: extraction.recentInsulin?.takenAt ?? {
        rawSpan: "",
        value: null,
        confidence: 0,
        status: "missing",
        requiresConfirmation: true,
      },
      insulinType: overlay.recentInsulin.insulinType
        ? {
            rawSpan: overlay.recentInsulin.insulinType,
            value: overlay.recentInsulin.insulinType,
            confidence: 0.6,
            status: "requires_review",
            requiresConfirmation: true,
          }
        : (extraction.recentInsulin?.insulinType ?? {
            rawSpan: "",
            value: null,
            confidence: 0,
            status: "requires_review",
            requiresConfirmation: true,
          }),
      concentratedInsulinAmbiguity: extraction.recentInsulin?.concentratedInsulinAmbiguity ?? false,
    };
    extraction = { ...extraction, recentInsulin };
  }

  extraction = {
    ...extraction,
    clarifications: generateClarifications({
      glucose: extraction.glucose,
      recentInsulin: extraction.recentInsulin,
      meal: extraction.meal,
      userStatedCarbs: extraction.userStatedCarbs,
    }),
  };
  const intent = classifyIntent(interpretation.originalText, extraction);
  const next: CaptureInterpretation = {
    ...interpretation,
    intent,
    extraction,
    proposedNextStep: proposedNextStepFor(intent, extraction),
  };
  assertNoTreatmentInvention(next);
  return next;
}

/**
 * Replaces the meal AST after a schema-validated language-model parse.
 * Nutrition and insulin remain outside this function — it only swaps the
 * structured food components and rebuilds clarifications/intent.
 */
export function overlayParsedMeal(interpretation: CaptureInterpretation, parsed: ParsedMeal): CaptureInterpretation {
  const meal = parsedMealToExtraction(parsed);
  const extraction: ProvisionalEvent = {
    ...interpretation.extraction,
    meal,
    clarifications: generateClarifications({
      glucose: interpretation.extraction.glucose,
      recentInsulin: interpretation.extraction.recentInsulin,
      meal,
      userStatedCarbs: interpretation.extraction.userStatedCarbs,
    }),
    mealPipeline: meal
      ? {
          rawInput: interpretation.originalText,
          mealText: parsed.mealText,
          parsedMeal: parsed,
          parseSource: parsed.parseSource,
          completenessValid: parsed.completeness.valid,
          confidenceGate: parsed.confidenceGate,
        }
      : interpretation.extraction.mealPipeline,
  };
  const intent = classifyIntent(interpretation.originalText, extraction);
  const next: CaptureInterpretation = {
    ...interpretation,
    intent,
    extraction,
    proposedNextStep: proposedNextStepFor(intent, extraction),
  };
  assertNoTreatmentInvention(next);
  return next;
}

export function overlaySemanticEvents(
  interpretation: CaptureInterpretation,
  overlayEvents: readonly SemanticEvent[],
  provenance?: LanguageProvenance,
): CaptureInterpretation {
  const merged = mergeSemanticEvents(interpretation.extraction.semanticEvents, overlayEvents);
  const extraction: ProvisionalEvent = {
    ...interpretation.extraction,
    semanticEvents: merged,
    completeness: validateSemanticCompleteness(interpretation.originalText, merged),
  };
  const next: CaptureInterpretation = {
    ...interpretation,
    extraction,
    languageProvenance: provenance ?? interpretation.languageProvenance,
  };
  assertNoTreatmentInvention(next);
  return next;
}
