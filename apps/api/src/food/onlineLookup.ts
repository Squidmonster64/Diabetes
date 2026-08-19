import type { OnlineFoodLookupCandidate } from "@diabetes-companion/food-contracts";

const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 3;
const USER_AGENT = "DiabetesCompanion/1.0 (https://github.com/Squidmonster64/Diabetes)";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function parseServingGrams(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!match) return null;
  const grams = Number(match[1]!.replace(",", "."));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCandidate(raw: unknown, retrievedAt: string): OnlineFoodLookupCandidate | null {
  const product = asRecord(raw);
  if (!product) return null;

  const code = stringOrNull(product.code);
  const name = stringOrNull(product.product_name);
  const nutriments = asRecord(product.nutriments);
  const carbohydratePer100g = finiteNumber(nutriments?.carbohydrates_100g);
  if (!code || !name || carbohydratePer100g === null || carbohydratePer100g < 0 || carbohydratePer100g > 100) return null;

  const servingGrams = parseServingGrams(product.serving_size);
  const carbohydratePerServing = finiteNumber(nutriments?.carbohydrates_serving);
  return {
    provider: "OPEN_FOOD_FACTS",
    productCode: code,
    name,
    brand: stringOrNull(product.brands),
    servingDescription: stringOrNull(product.serving_size),
    servingGrams,
    carbohydratePerServingGrams:
      servingGrams !== null && carbohydratePerServing !== null && carbohydratePerServing >= 0 ? carbohydratePerServing : null,
    carbohydratePer100gGrams: carbohydratePer100g,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    sourceRetrievedAt: retrievedAt,
    sourceReliability: "COMMUNITY_CONTRIBUTED",
  };
}

export interface OnlineFoodLookupResult {
  readonly candidates: readonly OnlineFoodLookupCandidate[];
  readonly unavailable: boolean;
}

/**
 * Searches a public product database only after the app's local sources did
 * not recognise a food. Returned values are proposals: callers must show the
 * product, source, serving basis, and carbohydrate value for explicit user
 * confirmation before persisting or using anything in a meal calculation.
 */
export async function lookupOnlineFood(query: string): Promise<OnlineFoodLookupResult> {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) return { candidates: [], unavailable: false };

  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("search_terms", normalized);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", String(MAX_RESULTS));
    url.searchParams.set("fields", "code,product_name,brands,nutriments,serving_size");

    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { candidates: [], unavailable: true };
    const payload = asRecord(await response.json());
    const products = Array.isArray(payload?.products) ? payload.products : [];
    const retrievedAt = new Date().toISOString();
    const candidates = products.map((product) => toCandidate(product, retrievedAt)).filter((candidate): candidate is OnlineFoodLookupCandidate => candidate !== null);
    return { candidates, unavailable: false };
  } catch {
    return { candidates: [], unavailable: true };
  }
}
