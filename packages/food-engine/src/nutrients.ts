/**
 * Flexible nutrient panel. `null` means the source did not publish a value.
 * `0` means the source published zero. Never coerce null to 0 for display.
 */
export const NUTRIENT_KEYS = [
  "energyKj",
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "saturatedFatG",
  "fibreG",
  "sugarG",
  "sodiumMg",
  "potassiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "cholesterolMg",
  "vitaminAUg",
  "vitaminCMg",
  "vitaminDUg",
  "vitaminB12Ug",
  "folateUg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type NutrientPanel = {
  readonly [K in NutrientKey]: number | null;
} & {
  /** Additional nutrients without a schema change. Values follow the same null-vs-zero rule. */
  readonly extra: Readonly<Record<string, number | null>>;
};

export interface NutrientMeta {
  readonly key: NutrientKey;
  readonly label: string;
  readonly unit: string;
  readonly group: "core" | "extended";
  readonly kind: "intake" | "minimum" | "limit" | "target";
}

export const NUTRIENT_META: readonly NutrientMeta[] = [
  { key: "energyKcal", label: "Energy", unit: "kcal", group: "core", kind: "target" },
  { key: "proteinG", label: "Protein", unit: "g", group: "core", kind: "minimum" },
  { key: "carbohydrateG", label: "Carbohydrate", unit: "g", group: "core", kind: "target" },
  { key: "fatG", label: "Fat", unit: "g", group: "core", kind: "target" },
  { key: "fibreG", label: "Fibre", unit: "g", group: "core", kind: "minimum" },
  { key: "sodiumMg", label: "Sodium", unit: "mg", group: "core", kind: "limit" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g", group: "extended", kind: "limit" },
  { key: "sugarG", label: "Sugar", unit: "g", group: "extended", kind: "intake" },
  { key: "energyKj", label: "Energy", unit: "kJ", group: "extended", kind: "target" },
  { key: "potassiumMg", label: "Potassium", unit: "mg", group: "extended", kind: "intake" },
  { key: "calciumMg", label: "Calcium", unit: "mg", group: "extended", kind: "minimum" },
  { key: "ironMg", label: "Iron", unit: "mg", group: "extended", kind: "minimum" },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg", group: "extended", kind: "minimum" },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", group: "extended", kind: "intake" },
  { key: "vitaminAUg", label: "Vitamin A", unit: "µg", group: "extended", kind: "intake" },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", group: "extended", kind: "intake" },
  { key: "vitaminDUg", label: "Vitamin D", unit: "µg", group: "extended", kind: "intake" },
  { key: "vitaminB12Ug", label: "Vitamin B12", unit: "µg", group: "extended", kind: "intake" },
  { key: "folateUg", label: "Folate", unit: "µg", group: "extended", kind: "intake" },
];

export const CORE_DISPLAY_NUTRIENTS: readonly NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fibreG",
  "sodiumMg",
];

export function emptyPanel(): NutrientPanel {
  return {
    energyKj: null,
    energyKcal: null,
    proteinG: null,
    carbohydrateG: null,
    fatG: null,
    saturatedFatG: null,
    fibreG: null,
    sugarG: null,
    sodiumMg: null,
    potassiumMg: null,
    calciumMg: null,
    ironMg: null,
    magnesiumMg: null,
    cholesterolMg: null,
    vitaminAUg: null,
    vitaminCMg: null,
    vitaminDUg: null,
    vitaminB12Ug: null,
    folateUg: null,
    extra: {},
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function scaleValue(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return round1(value * factor);
}

/** Scale a per-100g or per-100ml panel by grams or millilitres. */
export function scaleNutrients(per100: NutrientPanel, amount: number, basis = 100): NutrientPanel {
  const factor = amount / basis;
  const extra: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(per100.extra ?? {})) {
    extra[key] = scaleValue(value, factor);
  }
  return {
    energyKj: scaleValue(per100.energyKj, factor),
    energyKcal: scaleValue(per100.energyKcal, factor),
    proteinG: scaleValue(per100.proteinG, factor),
    carbohydrateG: scaleValue(per100.carbohydrateG, factor),
    fatG: scaleValue(per100.fatG, factor),
    saturatedFatG: scaleValue(per100.saturatedFatG, factor),
    fibreG: scaleValue(per100.fibreG, factor),
    sugarG: scaleValue(per100.sugarG, factor),
    sodiumMg: scaleValue(per100.sodiumMg, factor),
    potassiumMg: scaleValue(per100.potassiumMg, factor),
    calciumMg: scaleValue(per100.calciumMg, factor),
    ironMg: scaleValue(per100.ironMg, factor),
    magnesiumMg: scaleValue(per100.magnesiumMg, factor),
    cholesterolMg: scaleValue(per100.cholesterolMg, factor),
    vitaminAUg: scaleValue(per100.vitaminAUg, factor),
    vitaminCMg: scaleValue(per100.vitaminCMg, factor),
    vitaminDUg: scaleValue(per100.vitaminDUg, factor),
    vitaminB12Ug: scaleValue(per100.vitaminB12Ug, factor),
    folateUg: scaleValue(per100.folateUg, factor),
    extra,
  };
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null;
  return round1((left ?? 0) + (right ?? 0));
}

/**
 * Sum panels. A known zero plus unknown stays the known value.
 * Unknown + unknown stays unknown. Known + known adds.
 */
export function sumNutrients(panels: readonly NutrientPanel[]): NutrientPanel {
  const extraKeys = new Set<string>();
  for (const panel of panels) {
    for (const key of Object.keys(panel.extra ?? {})) extraKeys.add(key);
  }
  const extra: Record<string, number | null> = {};
  for (const key of extraKeys) {
    extra[key] = panels.reduce<number | null>((acc, panel) => addNullable(acc, (panel.extra ?? {})[key] ?? null), null);
  }
  const result: Record<string, number | null> = {};
  for (const key of NUTRIENT_KEYS) {
    result[key] = panels.reduce<number | null>((sum, panel) => addNullable(sum, panel[key]), null);
  }
  return { ...(result as Omit<NutrientPanel, "extra">), extra };
}

export function panelHasAnyValue(panel: NutrientPanel): boolean {
  return NUTRIENT_KEYS.some((key) => panel[key] !== null);
}

export function formatNutrient(value: number | null, unit?: string): string {
  if (value === null) return "—";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return unit ? `${formatted} ${unit}` : formatted;
}

export function kcalFromKj(energyKj: number | null): number | null {
  if (energyKj === null) return null;
  return round1(energyKj / 4.184);
}
