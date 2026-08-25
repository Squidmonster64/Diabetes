/**
 * Strict JSON Schema documents sent to OpenAI structured output.
 * The model may describe language only. Insulin doses and nutrient
 * arithmetic are omitted from the schema so they cannot be returned.
 */

const FOOD_ITEM_SCHEMA = {
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
} as const;

export const NUTRITION_MEAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    mealDescription: { type: ["string", "null"] },
    items: {
      type: "array",
      minItems: 1,
      items: FOOD_ITEM_SCHEMA,
    },
    unresolvedFragments: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export const DIABETES_EVENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["foods"],
  properties: {
    foods: {
      type: "array",
      items: FOOD_ITEM_SCHEMA,
    },
    glucose: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["value"],
      properties: {
        value: { type: "number" },
        unit: { type: ["string", "null"] },
        rawSpan: { type: ["string", "null"] },
      },
    },
    recentInsulin: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["amountUnits"],
      properties: {
        amountUnits: { type: "number" },
        insulinType: { type: ["string", "null"] },
        rawSpan: { type: ["string", "null"] },
      },
    },
    unresolvedFragments: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    settingsLanguageDetected: { type: "boolean" },
    doseRequestLanguageDetected: { type: "boolean" },
    emergencyLanguageDetected: { type: "boolean" },
  },
} as const;

export const NUTRITION_MEAL_SYSTEM_PROMPT = `You convert natural-language meal descriptions into structured food components.
Identify distinct foods. Bind each quantity and unit to the correct food.
Preserve branded names and uncertainty. Do not invent nutrition values.
Do not invent insulin, medication, or treatment recommendations.
Do not calculate energy, protein, carbohydrate, fat, fibre, sodium, or any other nutrient.
Canonical units: g, kg, ml, l, slice, piece, cup, tablespoon, teaspoon, serving, packet, can, bottle, handful, whole.
If a quantity is unknown, set quantity to null rather than guessing.`;

export const DIABETES_EVENT_SYSTEM_PROMPT = `You convert a diabetes diary utterance into structured language fields.
Extract only what the person said: foods, a glucose reading if stated, and insulin already taken if stated.
Do not calculate an insulin dose. Do not recommend units. Do not compute carbohydrate or any nutrient.
Do not invent glucose, insulin amounts, or food quantities that are not in the text.
If a quantity is unknown, omit it or set it null.
Canonical food units: g, kg, ml, l, slice, piece, cup, tablespoon, teaspoon, serving, packet, can, bottle, handful, whole.
Glucose units, when stated: mmol/L or mg/dL.`;

const FORBIDDEN_KEYS = new Set([
  "bolusDose",
  "dose",
  "roundedTotalUnits",
  "unroundedTotalUnits",
  "recommendedDose",
  "insulinDose",
  "carbohydrateGrams",
  "energyKcal",
  "proteinGrams",
  "fatGrams",
  "sodiumMg",
  "fibreGrams",
  "fiberGrams",
]);

export function containsForbiddenCalculationKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenCalculationKeys);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (containsForbiddenCalculationKeys(nested)) return true;
  }
  return false;
}
