import type Database from "better-sqlite3";
import type { FoodSearchResult, SourceDataset } from "@diabetes-companion/food-contracts";
import { FoodModuleError } from "./errors.js";

const MAX_QUERY_LENGTH = 200;
const CANDIDATE_LIMIT = 200;

interface SearchRow {
  source_dataset: SourceDataset;
  source_food_id: string;
  public_food_key: string;
  food_name: string;
  food_description: string | null;
  classification: string | null;
  carbohydrate_without_sugar_alcohols_per_100g: number | null;
  carbohydrate_with_sugar_alcohols_per_100g: number | null;
  carbohydrate_without_sugar_alcohols_per_100ml: number | null;
  carbohydrate_with_sugar_alcohols_per_100ml: number | null;
  search_text: string;
}

export interface FoodSearchOptions {
  readonly query: string;
  readonly sourceDataset?: SourceDataset;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface FoodSearchResponse {
  readonly results: readonly FoodSearchResult[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalMatches: number;
}

/** True if the string contains any ASCII control character other than plain tab. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isControl = (code >= 0 && code <= 31) || code === 127;
    if (isControl && code !== 9) return true;
  }
  return false;
}

function normalizeQuery(rawQuery: string): string {
  if (typeof rawQuery !== "string") throw new FoodModuleError("INVALID_QUERY", "Search query must be a string.");
  if (hasControlCharacter(rawQuery)) {
    throw new FoodModuleError("INVALID_QUERY", "Search query contains invalid control characters.");
  }
  const trimmed = rawQuery.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) throw new FoodModuleError("INVALID_QUERY", "Search query must not be empty.");
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new FoodModuleError("INVALID_QUERY", `Search query must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  return trimmed.toLowerCase();
}

function tokenize(normalizedQuery: string): string[] {
  return normalizedQuery
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Escape a token for safe embedding in an FTS5 MATCH query as a quoted prefix term. */
function escapeFtsToken(token: string): string {
  return `"${token.replace(/"/g, '""')}"*`;
}

function containsWholeWord(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "u").test(haystack);
}

type MatchType = FoodSearchResult["matchType"];

function classifyMatch(nameLower: string, searchText: string, normalizedQuery: string, tokens: string[]): MatchType {
  if (nameLower === normalizedQuery) return "EXACT";
  if (nameLower.startsWith(normalizedQuery)) return "PREFIX";
  if (containsWholeWord(nameLower, normalizedQuery)) return "WHOLE_WORD";
  if (tokens.length > 0 && tokens.every((token) => containsWholeWord(searchText, token))) return "TOKEN";
  return "SUBSTRING";
}

const MATCH_TYPE_RANK: Record<MatchType, number> = {
  EXACT: 0,
  PREFIX: 1,
  WHOLE_WORD: 2,
  TOKEN: 3,
  SUBSTRING: 4,
};

export function searchFoods(db: InstanceType<typeof Database>, options: FoodSearchOptions): FoodSearchResponse {
  const normalizedQuery = normalizeQuery(options.query);
  const tokens = tokenize(normalizedQuery);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 20)));

  const sourceFilter = options.sourceDataset ? "AND source_dataset = @sourceDataset" : "";
  const params: Record<string, unknown> = { sourceDataset: options.sourceDataset };

  let rows: SearchRow[] = [];

  if (tokens.length > 0) {
    const matchQuery = tokens.map(escapeFtsToken).join(" ");
    try {
      rows = db
        .prepare(
          `SELECT s.source_dataset, s.source_food_id, s.public_food_key, s.food_name, s.food_description,
                  s.classification, s.carbohydrate_without_sugar_alcohols_per_100g,
                  s.carbohydrate_with_sugar_alcohols_per_100g, s.carbohydrate_without_sugar_alcohols_per_100ml,
                  s.carbohydrate_with_sugar_alcohols_per_100ml, s.search_text
           FROM app_food_search_fts f
           JOIN app_australian_food_search s
             ON s.source_dataset = f.source_dataset AND s.source_food_id = f.source_food_id
           WHERE f MATCH @matchQuery ${sourceFilter}
           LIMIT @limit`,
        )
        .all({ matchQuery, sourceDataset: params.sourceDataset, limit: CANDIDATE_LIMIT }) as SearchRow[];
    } catch {
      rows = [];
    }
  }

  if (rows.length === 0) {
    // Sensible fallback matching: plain substring scan when FTS finds nothing.
    rows = db
      .prepare(
        `SELECT source_dataset, source_food_id, public_food_key, food_name, food_description, classification,
                carbohydrate_without_sugar_alcohols_per_100g, carbohydrate_with_sugar_alcohols_per_100g,
                carbohydrate_without_sugar_alcohols_per_100ml, carbohydrate_with_sugar_alcohols_per_100ml, search_text
         FROM app_australian_food_search
         WHERE search_text LIKE @pattern ESCAPE '\\' ${sourceFilter}
         LIMIT @limit`,
      )
      .all({
        pattern: `%${normalizedQuery.replace(/[\\%_]/g, "\\$&")}%`,
        sourceDataset: params.sourceDataset,
        limit: CANDIDATE_LIMIT,
      }) as SearchRow[];
  }

  // app_australian_food_search and app_food_search_fts do not include AFCD
  // liquids (see docs/data-source/application_views_report.md: unified
  // searchable foods = AUSNUT + AFCD solids only). Search the liquids view
  // directly so AFCD_RELEASE_3 liquid items remain discoverable.
  if (!options.sourceDataset || options.sourceDataset === "AFCD_RELEASE_3") {
    const likePattern = `%${normalizedQuery.replace(/[\\%_]/g, "\\$&")}%`;
    const liquidRows = db
      .prepare(
        `SELECT source_dataset, source_food_id, public_food_key, food_name, NULL AS food_description, classification,
                NULL AS carbohydrate_without_sugar_alcohols_per_100g, NULL AS carbohydrate_with_sugar_alcohols_per_100g,
                carbohydrate_without_sugar_alcohols_per_100ml, carbohydrate_with_sugar_alcohols_per_100ml,
                LOWER(TRIM(food_name || ' ' || COALESCE(classification, ''))) AS search_text
         FROM app_afcd_liquids_per_100ml
         WHERE LOWER(TRIM(food_name || ' ' || COALESCE(classification, ''))) LIKE @pattern ESCAPE '\\'
         LIMIT @limit`,
      )
      .all({ pattern: likePattern, limit: CANDIDATE_LIMIT }) as SearchRow[];
    rows = rows.concat(liquidRows);
  }

  const scored = rows.map((row) => {
    const nameLower = row.food_name.toLowerCase();
    const matchType = classifyMatch(nameLower, row.search_text, normalizedQuery, tokens);
    return { row, matchType };
  });

  scored.sort((a, b) => {
    const rankDiff = MATCH_TYPE_RANK[a.matchType] - MATCH_TYPE_RANK[b.matchType];
    if (rankDiff !== 0) return rankDiff;
    const lengthDiff = a.row.food_name.length - b.row.food_name.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.row.food_name.localeCompare(b.row.food_name);
  });

  const totalMatches = scored.length;
  const start = (page - 1) * pageSize;
  const pageItems = scored.slice(start, start + pageSize);

  const results: FoodSearchResult[] = pageItems.map(({ row, matchType }, index) => ({
    sourceDataset: row.source_dataset,
    sourceFoodId: row.source_food_id,
    publicFoodKey: row.public_food_key,
    foodName: row.food_name,
    foodDescription: row.food_description,
    classification: row.classification,
    matchType,
    rank: start + index,
    hasGramData:
      row.carbohydrate_without_sugar_alcohols_per_100g !== null ||
      row.carbohydrate_with_sugar_alcohols_per_100g !== null,
    hasMillilitreData:
      row.carbohydrate_without_sugar_alcohols_per_100ml !== null ||
      row.carbohydrate_with_sugar_alcohols_per_100ml !== null,
  }));

  return { results, page, pageSize, totalMatches };
}
