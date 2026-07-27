# Food adapter

The Australian food database (`data/australian_foods.sqlite`) is opened
**read-only** at startup (`apps/api/src/db.ts`). Its SHA-256 checksum is
verified against `docs/data-source/australian_foods.sqlite.sha256` and
startup fails clearly if the file is missing, the checksum mismatches, or
`pragma integrity_check` does not return `ok`. User data is never written
into this file.

This database file and its adapter code (`apps/api/src/food/`) are one of
the three areas covered by [`packages/bolus/FROZEN.md`](packages/bolus/FROZEN.md)'s
audit map (alongside the dose algorithm and plain-language generation, both
in `packages/bolus/`) - a change to the database's byte content is checked
in CI against the committed hash file above (`scripts/check-food-db-hash.mjs`),
and is expected to update that hash file in the same PR.

## Source views

Documented in [`docs/data-source/application_views_report.md`](docs/data-source/application_views_report.md).
The adapter (`apps/api/src/food/`) reads exclusively from these
application-facing views, never the raw imported sheets:

- `app_ausnut_foods` / `app_afcd_foods_per_100g` - per-100g carbohydrate
- `app_afcd_liquids_per_100ml` - per-100mL carbohydrate (liquids)
- `app_australian_food_search` / `app_food_search_fts` - unified search
- `app_ausnut_measures` - household measures (AUSNUT 2023 only)
- `app_carbohydrate_calculator_input` - reference view, not queried directly
  by the adapter (the adapter queries the per-100g/per-100ml/measures views
  directly for clearer provenance)

## Carbohydrate definition

Every result carries an explicit `carbohydrateDefinition`:

- `available_carbohydrate_without_sugar_alcohols` (preferred, used whenever
  present)
- `available_carbohydrate_with_sugar_alcohols` (fallback, used only when the
  former is `NULL` for that food)

Total carbohydrate is never substituted silently - see
`pickCarbohydrate()` in `apps/api/src/food/calculate.ts`.

## Search ranking

Implemented in `apps/api/src/food/search.ts`. Order, best match first:

1. `EXACT` - normalised food name equals the query
2. `PREFIX` - food name starts with the query
3. `WHOLE_WORD` - query appears as a whole word within the name
4. `TOKEN` - every query token appears as a whole word somewhere in the
   combined search text (name + description + classification)
5. `SUBSTRING` - fallback FTS5/`LIKE` match with no stronger signal

This ordering is what avoids the "apple / apple cider" ranking problem: an
exact or whole-word match on "apple" always outranks a food whose name
merely *contains* "apple" as a substring (e.g. "apple cider vinegar").
Regression tests for this live in `apps/api/test/food.search.test.ts`.

FTS5 search covers AUSNUT + AFCD solids (via `app_food_search_fts`); AFCD
liquids are not in that FTS index (see the data-source report's "unified
searchable foods" count), so the adapter additionally scans
`app_afcd_liquids_per_100ml` directly to keep liquid items discoverable.

## Quantity handling

`apps/api/src/food/calculate.ts` validates:

- grams/millilitres/measure-multiplier must be finite, `> 0`, and below a
  sanity ceiling (5000 g, 5000 mL, 100× a measure) - zero, negative, and
  unreasonably large quantities all refuse with `INVALID_QUANTITY` /
  `QUANTITY_TOO_LARGE`.
- household measures are only offered for AUSNUT 2023 items (this database
  has no AFCD measures); millilitre entry is only offered for AFCD liquid
  items.

## User-created foods and saved meals

`apps/api/src/customFoods/` and `apps/api/src/meals/` (added in
`feature/custom-foods-saved-meals`) extend the food side of the app - not
the bolus side - with:

- **Packet-label foods**: transcribed from a nutrition information panel.
  `validateCustomFoodInput` (`apps/api/src/customFoods/validation.ts`)
  derives a per-100g carbohydrate figure from serving-size arithmetic when
  the patient enters per-serving values instead of a direct per-100g
  figure - simple portion scaling, the same kind of arithmetic as the
  official-database gram/measure conversion, not a clinical formula.
- **Manual custom foods**: a direct carbohydrate-per-100g estimate with no
  serving-size structure required.
- **Saved, reusable multi-food meals**: a named recipe of components (mixing
  official AUSNUT/AFCD foods and custom foods), each with an **editable
  quantity**. `calculateMealCarbohydrate`
  (`apps/api/src/meals/calculate.ts`) sums each component's carbohydrate
  fresh every time - never a stored snapshot - and accepts optional
  per-instance quantity overrides (e.g. "usual breakfast, but a bigger
  serving today") that are not persisted to the saved recipe.
- **Meal duplication and archiving**: duplication deep-copies all
  components as a new independent recipe (editing the copy never affects
  the original); archiving hides a food or meal from selection lists
  without deleting it or breaking anything that already references it.

These additions are still governed by the same boundary rule below - a
saved meal's *computed total* crosses into the bolus module exactly like a
single food's carbohydrate figure does, and the bolus module has no
awareness that custom foods or saved meals exist.

## Boundary with the bolus module

**The bolus module never receives food names, brands, search results, or
provenance** - only a confirmed numeric carbohydrate-gram string crosses
that boundary (`ConfirmedCarbohydrateInput` in
`packages/food-contracts/src/index.ts`). See
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 14. This is unchanged
by the custom-foods/saved-meals feature: `packages/bolus` was not modified
to build it.
