import type { ParsedFoodItem } from "./types.js";

export const SEMANTIC_PARSER_VERSION = "semantic-events-v1";

export type SemanticEventType =
  | "GLUCOSE_READING"
  | "INSULIN_TAKEN"
  | "MEAL"
  | "SYMPTOM"
  | "ACTIVITY"
  | "CORRECTION_REQUEST"
  | "MEAL_DOSE_REQUEST"
  | "FOOD_LOOKUP"
  | "REVIEW_EVENT"
  | "SETTINGS_CHANGE_ATTEMPT"
  | "OTHER_CONTEXT"
  | "UNKNOWN";

export type InsulinActionStatus = "TAKEN" | "PLANNED" | "PRIMED" | "DIALLED" | "REQUESTED" | "UNCERTAIN" | "UNKNOWN";
export type ActivityStatus = "COMPLETED" | "ONGOING" | "PLANNED";

export interface SemanticEvent {
  readonly id: string;
  readonly type: SemanticEventType;
  readonly originalFragment: string;
  readonly eventTime: string | null;
  readonly relativeTime: string | null;
  readonly relativeTimeMinutes: number | null;
  readonly confidence: number;
  readonly unresolvedFields: readonly string[];
  readonly sourceOrder: number;
  readonly glucoseValue: number | null;
  readonly glucoseUnit: "mmol/L" | "mg/dL" | null;
  readonly qualitativeValue: "HI" | "LO" | null;
  readonly insulinAmountUnits: number | null;
  readonly insulinType: string | null;
  readonly actionStatus: InsulinActionStatus | null;
  readonly mealDescription: string | null;
  readonly foods: readonly ParsedFoodItem[];
  readonly statedCarbohydrateGrams: number | null;
  readonly symptom: string | null;
  readonly activityDescription: string | null;
  readonly activityStatus: ActivityStatus | null;
}

export interface CompletenessResult {
  readonly valid: boolean;
  readonly accountedFragments: readonly string[];
  readonly missingFragments: readonly string[];
  readonly interpretationStatus: "COMPLETE" | "INCOMPLETE";
}

export interface LanguageProvenance {
  readonly parseSource: "deterministic" | "llm" | "overlay";
  readonly model: string | null;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly parserVersion: string;
  readonly interpretedAt: string;
  readonly fallback: boolean;
  readonly latencyMs?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export function emptySemanticEvent(partial: Partial<SemanticEvent> & Pick<SemanticEvent, "id" | "type" | "originalFragment" | "sourceOrder">): SemanticEvent {
  return {
    eventTime: null,
    relativeTime: null,
    relativeTimeMinutes: null,
    confidence: 0.5,
    unresolvedFields: [],
    glucoseValue: null,
    glucoseUnit: null,
    qualitativeValue: null,
    insulinAmountUnits: null,
    insulinType: null,
    actionStatus: null,
    mealDescription: null,
    foods: [],
    statedCarbohydrateGrams: null,
    symptom: null,
    activityDescription: null,
    activityStatus: null,
    ...partial,
  };
}
