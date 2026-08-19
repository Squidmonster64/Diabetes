/**
 * Types for the natural-language diabetes event parser.
 *
 * This package is purely a text -> structured-draft transformer. It has no
 * network access and no database access. Its only output is a
 * ProvisionalEvent: a set of candidate values that a human must review and
 * explicitly confirm before anything here can reach carbohydrate
 * calculation or the deterministic bolus module in packages/bolus. Nothing
 * in this package performs dose arithmetic, infers an insulin-on-board
 * value, or decides between conflicting clinical interpretations - see
 * BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md and SAFETY_MODEL.md.
 *
 * The one intentional coupling to packages/bolus is a type-only import of
 * its closed `SpecialSituation` enum, so this package can never invent a
 * clinical category the bolus module doesn't already recognise.
 */
import type { SpecialSituation } from "@diabetes-companion/bolus";

/**
 * `missing`: a value the handoff/gates require was not stated at all and
 *   must block progress until supplied (e.g. "I took units of insulin").
 * `requires_review`: a value was extracted but is vague, low-confidence, or
 *   inherently needs a human decision (e.g. "a little butter").
 * `provisional`: a value was extracted with reasonable confidence and is
 *   ready to display for review, but is never treated as confirmed until
 *   the user takes the explicit confirmation action.
 * `confirmed`: the user has explicitly confirmed this value (set only by
 *   the review UI, never by the parser itself).
 */
export type ExtractionStatus = "missing" | "requires_review" | "provisional" | "confirmed";

/**
 * A single extracted value, always traceable back to the original text.
 * Every field this package produces is wrapped in this shape per the
 * implementation spec: original text span, normalised value, confidence,
 * status, and whether user confirmation is required.
 */
export interface ExtractedValue<T> {
  /** The exact substring of the (normalised) input this value came from, or "" if not found. */
  readonly rawSpan: string;
  /** The normalised value, or null if missing/unresolved. Never guessed. */
  readonly value: T | null;
  /** 0..1. Deterministic parsing uses fixed confidence tiers, not a model score. */
  readonly confidence: number;
  readonly status: ExtractionStatus;
  /** Always true for any value that will affect carbohydrate or dose-adjacent gates. */
  readonly requiresConfirmation: boolean;
}

export type GlucoseUnit = "MMOL_L" | "MG_DL";

export interface GlucoseExtraction {
  readonly value: ExtractedValue<number>;
  readonly unit: ExtractedValue<GlucoseUnit>;
  /** ISO 8601, or null if genuinely unstated (resolved to "now" by the caller, not invented here). */
  readonly timestamp: ExtractedValue<string>;
}

export interface InsulinExtraction {
  readonly amountUnits: ExtractedValue<number>;
  readonly takenAt: ExtractedValue<string>;
  /** Only populated when a type/brand is explicitly named in the text. */
  readonly insulinType: ExtractedValue<string>;
  /** True when the text raises a concentration/ambiguity cue (e.g. "concentrated", "U-500"). */
  readonly concentratedInsulinAmbiguity: boolean;
}

export type FoodComponentQuantityKind = "GRAMS" | "MILLILITRES" | "COUNT" | "SERVING" | "VAGUE" | "UNKNOWN";

export interface FoodComponentExtraction {
  /** The food-name phrase, exactly as it should be used as a search term - never altered. */
  readonly phrase: string;
  readonly rawSpan: string;
  readonly quantity: ExtractedValue<number>;
  readonly unit: ExtractedValue<string>;
  readonly quantityKind: FoodComponentQuantityKind;
  /** Set only by the review UI after the user selects a concrete database measure for a SERVING phrase. */
  readonly selectedServingMeasureId: string | null;
  /** A vague quantifier as stated ("a little", "some", "a bowl of"), if any. */
  readonly qualifier: string | null;
  readonly matchStatus: ExtractionStatus;
  /** True for foods on the negligible-carbohydrate list with no stated quantity at all -
   * the app must not ask for a quantity that cannot materially affect the calculation. */
  readonly quantityNeededForCalculation: boolean;
}

export interface MealExtraction {
  readonly components: readonly FoodComponentExtraction[];
  /** The stated container word ("sandwich", "wrap"), if any - lets a
   * clarification question reference "the sandwich" instead of repeating
   * the food name awkwardly. Never used to infer a component's identity. */
  readonly containerContext: string | null;
}

export interface SymptomExtraction {
  readonly hypoSymptoms: boolean;
  /** Mapped only onto the bolus module's existing closed SpecialSituation enum values -
   * this package never invents a new clinical category. */
  readonly specialSituations: readonly SpecialSituation[];
  readonly rawPhrases: readonly string[];
}

export interface ClarificationQuestion {
  /** Dot-path into the ProvisionalEvent this question resolves, e.g. "recentInsulin.amountUnits". */
  readonly field: string;
  readonly question: string;
  /** Blocking questions (status "missing") must be answered before the review
   * screen's confirm action is enabled. */
  readonly blocking: boolean;
}

export interface CorrectionApplied {
  readonly field: string;
  readonly previousValue: unknown;
  readonly correctedValue: unknown;
  readonly correctionText: string;
}

export interface ProvisionalEvent {
  /** Verbatim input text, dictated or typed - never mutated. */
  readonly originalText: string;
  readonly normalisedText: string;
  readonly glucose: GlucoseExtraction | null;
  readonly recentInsulin: InsulinExtraction | null;
  readonly meal: MealExtraction | null;
  readonly symptoms: SymptomExtraction;
  readonly clarifications: readonly ClarificationQuestion[];
  readonly correctionsApplied: readonly CorrectionApplied[];
  /** ISO 8601 timestamp used as "now" for resolving relative times - supplied by the
   * caller (the device clock), never invented by the parser. */
  readonly referenceNow: string;
}

export function hasBlockingClarifications(event: ProvisionalEvent): boolean {
  return event.clarifications.some((clarification) => clarification.blocking);
}
