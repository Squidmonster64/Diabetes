/**
 * Language-only OpenAI interpretation for Diabetes and Nutrition.
 * Nutrient totals and insulin arithmetic stay in deterministic engines.
 */
import {
  overlayLanguageEvent,
  overlayParsedMeal,
  overlaySemanticEvents,
  parseMeal,
  semanticEventsFromUnknown,
  validateParsedMeal,
  SEMANTIC_PARSER_VERSION,
  type CaptureInterpretation,
  type LanguageProvenance,
  type ParsedMeal,
} from "@diabetes-companion/natural-language";
import { completeJsonSchema, resolveOpenAiRuntime, type AiLogger } from "./openaiClient.js";
import {
  containsForbiddenCalculationKeys,
  DIABETES_EVENT_JSON_SCHEMA,
  DIABETES_EVENT_SYSTEM_PROMPT,
  NUTRITION_MEAL_JSON_SCHEMA,
  NUTRITION_MEAL_SYSTEM_PROMPT,
} from "./schemas.js";
import {
  DEFAULT_INTERPRETATION_MODEL,
  DIABETES_EVENT_PROMPT_VERSION,
  DIABETES_EVENT_SCHEMA_NAME,
  NUTRITION_MEAL_PROMPT_VERSION,
  NUTRITION_MEAL_SCHEMA_NAME,
} from "./versions.js";

export interface LanguageRuntimeOptions {
  readonly apiKey?: string;
  readonly interpretationModel?: string;
  readonly transcriptionModel?: string;
  readonly transcriptionProvider?: string;
  readonly logger?: AiLogger;
  readonly nodeEnv?: string;
}

function runtimeFrom(options: LanguageRuntimeOptions) {
  return resolveOpenAiRuntime({
    apiKey: options.apiKey,
    interpretationModel: options.interpretationModel,
    transcriptionModel: options.transcriptionModel,
    transcriptionProvider: options.transcriptionProvider,
    logger: options.logger,
  });
}

export function chooseMealParse(deterministic: ParsedMeal, llm: ParsedMeal | null): ParsedMeal {
  if (!llm) return deterministic;
  if (llm.items.length < deterministic.items.length) return deterministic;
  return llm;
}

export async function parseMealWithLanguageModel(
  originalText: string,
  apiKey: string,
  options: Pick<LanguageRuntimeOptions, "interpretationModel" | "logger"> = {},
): Promise<ParsedMeal | null> {
  const runtime = runtimeFrom({ apiKey, interpretationModel: options.interpretationModel, logger: options.logger });
  if (!runtime) return null;
  const completion = await completeJsonSchema({
    runtime,
    schemaName: NUTRITION_MEAL_SCHEMA_NAME,
    schema: NUTRITION_MEAL_JSON_SCHEMA as unknown as Record<string, unknown>,
    systemPrompt: NUTRITION_MEAL_SYSTEM_PROMPT,
    userText: originalText,
  });
  if (!completion || containsForbiddenCalculationKeys(completion.content)) return null;
  return validateParsedMeal(completion.content, originalText);
}

export async function overlayLanguageModelMealParse(
  interpretation: CaptureInterpretation,
  apiKey: string | undefined,
  options: LanguageRuntimeOptions = {},
): Promise<CaptureInterpretation> {
  return overlayLanguageModelCapture(interpretation, { ...options, apiKey });
}

export async function overlayLanguageModelCapture(
  interpretation: CaptureInterpretation,
  options: LanguageRuntimeOptions,
): Promise<CaptureInterpretation> {
  const deterministic = interpretation.extraction.meal?.parsedMeal ?? parseMeal(interpretation.originalText);
  const runtime = runtimeFrom(options);
  const interpretedAt = new Date().toISOString();
  if (!runtime) {
    return {
      ...interpretation,
      languageProvenance: {
        parseSource: "deterministic",
        model: null,
        promptVersion: "deterministic-only",
        schemaVersion: SEMANTIC_PARSER_VERSION,
        parserVersion: SEMANTIC_PARSER_VERSION,
        interpretedAt,
        fallback: false,
      },
    };
  }
  try {
    const completion = await completeJsonSchema({
      runtime,
      schemaName: DIABETES_EVENT_SCHEMA_NAME,
      schema: DIABETES_EVENT_JSON_SCHEMA as unknown as Record<string, unknown>,
      systemPrompt: DIABETES_EVENT_SYSTEM_PROMPT,
      userText: interpretation.originalText,
    });
    const provenance = (fallback: boolean, model: string | null, extra: Pick<LanguageProvenance, "latencyMs" | "promptTokens" | "completionTokens"> = {}): LanguageProvenance => ({
      parseSource: fallback ? "deterministic" : "overlay",
      model,
      promptVersion: DIABETES_EVENT_PROMPT_VERSION,
      schemaVersion: DIABETES_EVENT_SCHEMA_NAME,
      parserVersion: SEMANTIC_PARSER_VERSION,
      interpretedAt,
      fallback,
      ...extra,
    });
    if (!completion || containsForbiddenCalculationKeys(completion.content)) {
      return {
        ...interpretation,
        languageProvenance: provenance(true, runtime.interpretationModel, {
          latencyMs: completion?.latencyMs,
          promptTokens: completion?.usage?.promptTokens,
          completionTokens: completion?.usage?.completionTokens,
        }),
      };
    }
    const raw = completion.content as Record<string, unknown>;
    const mealSource = { ...raw, items: raw.foods ?? raw.items };
    const llmMeal = validateParsedMeal(mealSource, interpretation.originalText);
    const chosenMeal = chooseMealParse(deterministic, llmMeal);
    const withMeal =
      llmMeal && chosenMeal === llmMeal
        ? overlayParsedMeal(interpretation, { ...chosenMeal, parseSource: "llm" })
        : interpretation;
    const withFields = overlayLanguageEvent(withMeal, {
      glucose: asOptionalReading(raw.glucose),
      recentInsulin: asOptionalInsulin(raw.recentInsulin),
    });
    return overlaySemanticEvents(
      withFields,
      semanticEventsFromUnknown(raw),
      provenance(false, completion.model, {
        latencyMs: completion.latencyMs,
        promptTokens: completion.usage?.promptTokens,
        completionTokens: completion.usage?.completionTokens,
      }),
    );
  } catch {
    return {
      ...interpretation,
      languageProvenance: {
        parseSource: "deterministic",
        model: runtime.interpretationModel,
        promptVersion: DIABETES_EVENT_PROMPT_VERSION,
        schemaVersion: DIABETES_EVENT_SCHEMA_NAME,
        parserVersion: SEMANTIC_PARSER_VERSION,
        interpretedAt,
        fallback: true,
      },
    };
  }
}

function asOptionalReading(value: unknown): { value: number; unit: string | null; rawSpan: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) return null;
  return {
    value: record.value,
    unit: typeof record.unit === "string" ? record.unit : null,
    rawSpan: typeof record.rawSpan === "string" ? record.rawSpan : "",
  };
}

function asOptionalInsulin(value: unknown): { amountUnits: number; insulinType: string | null; rawSpan: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.amountUnits !== "number" || !Number.isFinite(record.amountUnits)) return null;
  return {
    amountUnits: record.amountUnits,
    insulinType: typeof record.insulinType === "string" ? record.insulinType : null,
    rawSpan: typeof record.rawSpan === "string" ? record.rawSpan : "",
  };
}

export function interpretationModelVersion(parseSource: "deterministic" | "llm", model?: string | null): string | null {
  if (parseSource !== "llm") return null;
  return model?.trim() || DEFAULT_INTERPRETATION_MODEL;
}

export { DIABETES_EVENT_PROMPT_VERSION, NUTRITION_MEAL_PROMPT_VERSION };
