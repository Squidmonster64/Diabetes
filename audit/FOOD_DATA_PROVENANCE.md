# Food data provenance

## Database

- File: `data/australian_foods.sqlite`
- SHA-256: `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`
  (matches `docs/data-source/australian_foods.sqlite.sha256`, verified at
  API startup - see `apps/api/src/db.ts`)
- `pragma integrity_check`: `ok` (verified both at generation time per
  `docs/data-source/application_views_report.md` and at API startup)
- Search mode: SQLite FTS5

## Source datasets

| Dataset | Records | Source object |
|---|---:|---|
| AUSNUT 2023 | 3,741 foods, 9,816 household measures | `app_ausnut_foods`, `app_ausnut_measures` |
| AFCD Release 3 | 1,588 solid foods, 213 liquids | `app_afcd_foods_per_100g`, `app_afcd_liquids_per_100ml` |
| Unified search | 5,329 items | `app_australian_food_search`, `app_food_search_fts` |

Original source workbook hashes (AUSNUT/AFCD Excel exports) are recorded in
[`../docs/data-source/source_manifest.csv`](../docs/data-source/source_manifest.csv).

## Carbohydrate definition

Every carbohydrate figure returned by the API carries an explicit
`carbohydrateDefinition`:

- `available_carbohydrate_without_sugar_alcohols` - used whenever the
  source data records this value;
- `available_carbohydrate_with_sugar_alcohols` - used only as an explicit,
  documented fallback when the former is `NULL` for that food (see
  `pickCarbohydrate()` in `apps/api/src/food/calculate.ts`).

Total carbohydrate is never silently substituted for available
carbohydrate, per `APP_BUILD_PROMPT.md` section 7.

## Result provenance object

Every `CarbohydrateCalculationResult` (see
`packages/food-contracts/src/index.ts`) carries:

```json
{
  "database": "australian_foods.sqlite",
  "sourceObject": "app_ausnut_foods | app_afcd_foods_per_100g | app_afcd_liquids_per_100ml | app_ausnut_measures",
  "databaseSha256": "af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c"
}
```

## Boundary with clinical calculation

The bolus module never receives any of the above provenance, food names, or
brand information - only the confirmed numeric `carbohydrateGrams` value
crosses into `packages/bolus` (`ConfirmedCarbohydrateInput` in
`packages/food-contracts`). See [`FOOD_ADAPTER.md`](../FOOD_ADAPTER.md)
section "Boundary with the bolus module".
