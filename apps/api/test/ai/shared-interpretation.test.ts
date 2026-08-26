import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseMealParse,
  completeJsonSchema,
  containsForbiddenCalculationKeys,
  overlayLanguageModelCapture,
  parseMealWithLanguageModel,
  resolveOpenAiRuntime,
  requiresWhisperFallback,
} from "../../src/ai/index.js";
import { interpretCapture, parseMeal } from "@diabetes-companion/natural-language";
import { DEFAULT_INTERPRETATION_MODEL, DEFAULT_TRANSCRIPTION_MODEL } from "../../src/ai/versions.js";
import { DIABETES_EVENT_JSON_SCHEMA, NUTRITION_MEAL_JSON_SCHEMA } from "../../src/ai/schemas.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Fragments-compatible OpenAI runtime", () => {
  it("uses OPENAI_API_KEY and Fragments transcription defaults", () => {
    const runtime = resolveOpenAiRuntime({ apiKey: "sk-test" });
    expect(runtime?.interpretationModel).toBe(DEFAULT_INTERPRETATION_MODEL);
    expect(runtime?.transcriptionModel).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    expect(runtime?.transcriptionProvider).toBe("openai");
  });

  it("does not configure a runtime without a server key", () => {
    expect(resolveOpenAiRuntime({ apiKey: "  " })).toBeNull();
    expect(resolveOpenAiRuntime({})).toBeNull();
  });

  it("retries transcription onto whisper-1 only for the Fragments gateway condition", () => {
    expect(requiresWhisperFallback(400, "Only whisper-1 is supported for this model", "gpt-4o-transcribe")).toBe(true);
    expect(requiresWhisperFallback(500, "Only whisper-1 is supported", "gpt-4o-transcribe")).toBe(false);
    expect(requiresWhisperFallback(400, "invalid audio", "gpt-4o-transcribe")).toBe(false);
  });
});

describe("structured-output safety", () => {
  it("rejects payloads that include insulin or nutrient arithmetic keys", () => {
    expect(containsForbiddenCalculationKeys({ foods: [], recommendedDose: 4 })).toBe(true);
    expect(containsForbiddenCalculationKeys({ items: [{ foodName: "banana", carbohydrateGrams: 20 }] })).toBe(true);
    expect(containsForbiddenCalculationKeys({ items: [{ foodName: "banana", quantity: 2 }] })).toBe(false);
  });

  it("nutrition and diabetes schemas omit dose and nutrient fields", () => {
    const mealProps = NUTRITION_MEAL_JSON_SCHEMA.properties as Record<string, unknown>;
    const eventProps = DIABETES_EVENT_JSON_SCHEMA.properties as Record<string, unknown>;
    expect(mealProps.energyKcal).toBeUndefined();
    expect(eventProps.recommendedDose).toBeUndefined();
    expect(eventProps.foods).toBeDefined();
    expect(eventProps.events).toBeDefined();
    expect(eventProps.glucose).toBeDefined();
  });
});

describe("language overlay against the Diabetes regression suite", () => {
  const GOLDEN = "two bananas and two slices of white bread with 50 grams of butter";

  it("keeps the deterministic meal when the model drops an ingredient", () => {
    const deterministic = parseMeal(GOLDEN);
    const weaker = { ...deterministic, items: deterministic.items.slice(0, 1), parseSource: "llm" as const };
    expect(chooseMealParse(deterministic, weaker).items).toHaveLength(3);
  });

  it("falls back to the deterministic capture when OpenAI is unset", async () => {
    const interpretation = interpretCapture("My blood glucose is 8.4 mmol/L and I am eating 40 grams of rice.", Date.parse("2026-07-25T20:00:00.000Z"));
    const overlayed = await overlayLanguageModelCapture(interpretation, {});
    expect(overlayed.extraction.glucose?.value.value).toBe(8.4);
    expect(overlayed.intent.intent).toBe("MEAL_BOLUS_CANDIDATE");
    expect((overlayed as unknown as { roundedTotalUnits?: number }).roundedTotalUnits).toBeUndefined();
  });

  it("discards structured output that invents a dose", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ foods: [{ foodName: "rice", quantity: 40, unit: "g", confidence: 0.9 }], recommendedDose: 6 }) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
    const interpretation = interpretCapture("My blood glucose is 8.4 mmol/L and I am eating 40 grams of rice.", Date.parse("2026-07-25T20:00:00.000Z"));
    const overlayed = await overlayLanguageModelCapture(interpretation, { apiKey: "sk-test" });
    expect(overlayed.extraction.glucose?.value.value).toBe(8.4);
    expect((overlayed as unknown as { recommendedDose?: number }).recommendedDose).toBeUndefined();
  });

  it("merges sandwich semantic events from schema-valid model output without inventing a dose", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "gpt-4o-mini",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  events: [
                    { type: "GLUCOSE_READING", originalFragment: "My blood glucose is 17", eventTime: null, relativeTime: "now", relativeTimeMinutes: 0, confidence: 0.9, unresolvedFields: ["glucose.unit"], glucoseValue: 17, glucoseUnit: null, qualitativeValue: null, insulinAmountUnits: null, insulinType: null, actionStatus: null, mealDescription: null, foods: [], statedCarbohydrateGrams: null, symptom: null, activityDescription: null, activityStatus: null },
                    { type: "SYMPTOM", originalFragment: "I feel nauseous", eventTime: null, relativeTime: "now", relativeTimeMinutes: 0, confidence: 0.9, unresolvedFields: [], glucoseValue: null, glucoseUnit: null, qualitativeValue: null, insulinAmountUnits: null, insulinType: null, actionStatus: null, mealDescription: null, foods: [], statedCarbohydrateGrams: null, symptom: "nauseous", activityDescription: null, activityStatus: null },
                  ],
                  foods: [{ foodName: "cheese sandwich", originalFragment: "cheese sandwich", brand: null, quantity: 1, unit: "whole", grams: null, preparation: null, modifiers: [], confidence: 0.9, assumptions: [], qualifier: null }],
                  glucose: { value: 17, unit: null, rawSpan: "17" },
                  recentInsulin: { amountUnits: 10, insulinType: "short acting", rawSpan: "10 units" },
                  unresolvedFragments: [],
                  warnings: [],
                  settingsLanguageDetected: false,
                  doseRequestLanguageDetected: false,
                  emergencyLanguageDetected: false,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
    const sandwich = "My blood glucose is 17 and I feel nauseous. I took 10 units of short acting insulin ten minutes ago. I ate a cheese sandwich four hours ago.";
    const interpretation = interpretCapture(sandwich, Date.parse("2026-08-26T04:00:00.000Z"));
    const overlayed = await overlayLanguageModelCapture(interpretation, { apiKey: "sk-test" });
    expect(overlayed.extraction.semanticEvents.some((event) => event.type === "SYMPTOM" && event.symptom === "nauseous")).toBe(true);
    expect(overlayed.extraction.semanticEvents.some((event) => event.type === "MEAL" && /cheese sandwich/i.test(event.mealDescription ?? ""))).toBe(true);
    expect((overlayed as unknown as { recommendedDose?: number }).recommendedDose).toBeUndefined();
    expect(overlayed.languageProvenance?.promptVersion).toBe("diabetes-event-v2");
  });

  it("schema-validates a nutrition meal completion before it can replace the AST", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; response_format?: { json_schema?: { name?: string } } };
      expect(String(input)).toContain("/v1/chat/completions");
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.response_format?.json_schema?.name).toBe("parsed_meal");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-test");
      return new Response(
        JSON.stringify({
          model: "gpt-4o-mini",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    { foodName: "banana", quantity: 2, unit: "whole", confidence: 0.9 },
                    { foodName: "white bread", quantity: 2, unit: "slice", confidence: 0.9 },
                    { foodName: "butter", quantity: 50, unit: "g", confidence: 0.9 },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const parsed = await parseMealWithLanguageModel(GOLDEN, "sk-test");
    expect(parsed?.items).toHaveLength(3);
    expect(parsed?.parseSource).toBe("llm");
  });

  it("logs a failed chat completion without echoing the API key", async () => {
    const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })) as typeof fetch;
    const result = await completeJsonSchema({
      runtime: resolveOpenAiRuntime({
        apiKey: "sk-secret-do-not-log",
        logger: {
          warn(payload, message) {
            warnings.push({ payload, message });
          },
        },
      })!,
      schemaName: "parsed_meal",
      schema: { type: "object" },
      systemPrompt: "test",
      userText: "two bananas",
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0])).not.toContain("sk-secret-do-not-log");
    expect(warnings[0]?.payload.model).toBe("gpt-4o-mini");
  });
});
