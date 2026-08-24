/**
 * Optional language-model overlay for meal parsing.
 *
 * The model may only identify foods, quantities, units, modifiers, and
 * uncertainty. It must never invent nutrition values or insulin doses.
 * Output is schema-validated before it can replace the deterministic AST.
 */
import { overlayParsedMeal, parseMeal, validateParsedMeal, type CaptureInterpretation, type ParsedMeal } from "@diabetes-companion/natural-language";

const MEAL_PARSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    mealDescription: { type: ["string", "null"] },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["foodName", "confidence"],
        properties: {
          originalFragment: { type: "string" },
          foodName: { type: "string" },
          brand: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          grams: { type: ["number", "null"] },
          preparation: { type: ["string", "null"] },
          modifiers: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          assumptions: { type: "array", items: { type: "string" } },
          qualifier: { type: ["string", "null"] },
        },
      },
    },
    unresolvedFragments: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM_PROMPT = `You convert natural-language meal descriptions into structured food components.
Identify distinct foods. Bind each quantity and unit to the correct food.
Preserve branded names and uncertainty. Do not invent nutrition values.
Do not invent insulin, medication, or treatment recommendations.
Canonical units: g, kg, ml, l, slice, piece, cup, tablespoon, teaspoon, serving, packet, can, bottle, handful, whole.
If a quantity is unknown, set quantity to null rather than guessing.`;

export function chooseMealParse(deterministic: ParsedMeal, llm: ParsedMeal | null): ParsedMeal {
  if (!llm) return deterministic;
  // A weaker model parse must not erase ingredients the deterministic parser found.
  if (llm.items.length < deterministic.items.length) return deterministic;
  return llm;
}

export async function parseMealWithLanguageModel(originalText: string, apiKey: string): Promise<ParsedMeal | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "parsed_meal", strict: true, schema: MEAL_PARSE_JSON_SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: originalText },
      ],
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return validateParsedMeal(JSON.parse(content), originalText);
  } catch {
    return null;
  }
}

export async function overlayLanguageModelMealParse(
  interpretation: CaptureInterpretation,
  apiKey: string | undefined,
): Promise<CaptureInterpretation> {
  const deterministic = interpretation.extraction.meal?.parsedMeal ?? parseMeal(interpretation.originalText);
  if (!apiKey) return interpretation;
  try {
    const llm = await parseMealWithLanguageModel(interpretation.originalText, apiKey);
    const chosen = chooseMealParse(deterministic, llm);
    if (chosen.parseSource === "deterministic" && chosen === deterministic) return interpretation;
    return overlayParsedMeal(interpretation, { ...chosen, parseSource: llm && chosen === llm ? "llm" : chosen.parseSource });
  } catch {
    return interpretation;
  }
}
