# Test results

## Test command and environment

```bash
npm run test         # unit + integration
npm run test:e2e      # Playwright black-box API e2e
npm run typecheck      # TypeScript --noEmit, every workspace
```

- Node.js `v24.18.0`, npm `11.16.0`
- Executed locally against `data/australian_foods.sqlite`
  (sha256 `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`)

## Result summary

| Suite | Files | Tests | Passed | Failed |
|---|---:|---:|---:|---:|
| `packages/bolus` (unit, **unchanged by the custom-foods/saved-meals or natural-language feature**) | 6 | 102 | 102 | 0 |
| `packages/natural-language` (unit, new) | 1 | 24 | 24 | 0 |
| `apps/api` (unit: food adapter) | 2 | 20 | 20 | 0 |
| `apps/api` (unit: custom-foods validation/calculation) | 1 | 14 | 14 | 0 |
| `apps/api` (integration: full API, pre-existing) | 5 | 12 | 12 | 0 |
| `apps/api` (integration: custom foods + saved meals + custom-food single-item calculate) | 1 | 16 | 16 | 0 |
| `apps/web` (unit: apiClient + food-match resolver) | 2 | 7 | 7 | 0 |
| `tests/e2e` (Playwright, black-box HTTP) | 1 | 8 | 8 | 0 |
| **Total** | **19** | **203** | **203** | **0** |

(The `apps/api` rows all run under `npm run test --workspace apps/api`,
which vitest reports as a single 9-file, 62-test run - split above for
clarity between the pure unit tests and the full-server integration tests.
An earlier version of this table mislabelled the pre-existing integration
row as 32 tests; the correct figure, reconciled against the actual vitest
output below, is 12.)

## Natural-language event entry (`feature/natural-language-entry`) - 31 tests

`packages/natural-language/test/segment-event.test.ts` (24 acceptance tests,
one per scenario in the feature's specification): the full combined
statement (glucose + prior insulin + a three-component meal); a bare
"units" mention never read as a numeric insulin amount; a missing bread
quantity producing the exact required clarification wording ("How many
slices of white bread are in the sandwich?"); an alternate phrasing with a
drink component; explicit mg/dL detection (never guessed from magnitude);
relative ("an hour ago") and absolute ("at 3pm") time resolution; a
low-glucose statement with hypoglycaemia symptom detection; a spoken
self-correction ("I meant three slices, not two") actually rewriting the
matching quantity; multiple foods plus a drink with no blocking
clarifications; a concentrated-insulin ambiguity cue producing a blocking
clarification; a source-scan test asserting the package never references
`calculateMealBolus`/`calculateCorrectionBolus`/`calculateBolusPreview`/
`confirmBolus`; a test that no extracted status is ever `"confirmed"` by the
parser itself; a test that a food component only ever exposes the fixed
review-safe field set (no raw database row shape); and a pure-function
property test proving identical input text (dictated or typed) always
produces identical output.

`apps/web/src/lib/foodMatch.test.ts` (5 unit tests, stubbed API
dependencies): unmatched when no source has a candidate; auto-calculation
for a high-confidence AUSNUT match with a gram quantity; a low-confidence
match marked ambiguous with no auto-calculation; zero carbohydrate
contributed (not guessed) for a negligible-carbohydrate food with no stated
quantity; a custom food's exact-name match preferred over a lower-confidence
database match, using the custom food's `servingGrams` to convert a count
quantity to grams.

`apps/api/test/integration/custom-foods-and-meals.test.ts` (+2 tests): the
new `POST /custom-foods/:id/calculate-carbohydrate` route scales a custom
food's per-100g figure by requested grams, and refuses another patient's
custom food with `404` (same patient-isolation pattern as every other
custom-food/meal route).

`npm run typecheck` passes with zero errors across every workspace,
including the new `packages/natural-language` and its dependents.
`npm run build --workspace apps/web` (a real Vite/Rollup production bundle,
not just `tsc --noEmit`) also passes - this caught a real bug during
development: `detect-symptoms.ts` initially did a runtime (value) import of
`SPECIAL_SITUATIONS` from `packages/bolus` purely for a redundant defensive
filter, which pulled bolus's Node-only `settings.ts` (`node:crypto`) into
the browser bundle and broke the production build. Fixed by removing the
redundant runtime check (TypeScript already guarantees every literal in
`detect-symptoms.ts`'s keyword table is a valid `SpecialSituation` at
compile time) and keeping only a type-only import, which is erased
entirely at compile time - confirmed by grepping the compiled
`dist/src/*.js` output for the string `"bolus"` and finding it only in
comments, never in an import statement.

## Custom foods and saved meals (`feature/custom-foods-saved-meals`) - 28 tests

`apps/api/test/customFoods.validation.test.ts` (14 unit tests): packet-label
per-100g derivation from serving size, manual direct-entry, zero-carbohydrate
servings (e.g. water), rejection of foods with no carbohydrate basis at all,
blank names, non-positive serving weights, out-of-range per-100g figures,
and unrecognised food types; carbohydrate scaling by grams, archived foods
still calculating correctly (archiving only affects picker visibility),
and rejection of non-positive/oversized quantities.

`apps/api/test/integration/custom-foods-and-meals.test.ts` (14 integration
tests): full CRUD and archive/unarchive for custom foods; creating a meal
that mixes an official AUSNUT food and a custom food with a correctly
computed total; editing a component's quantity and confirming the total
recalculates; adding and removing components; duplicating a meal (confirming
edits to the duplicate never affect the original); archiving/unarchiving a
meal; per-instance quantity overrides via `calculate-carbohydrate` that do
not persist to the saved recipe; rejecting a meal component that references
another patient's custom food; patient-isolation for both custom foods and
meals; and - critically - **feeding a meal's computed total into
`POST /api/v1/bolus/preview` unmodified**, confirming the feature integrates
through the existing food→bolus boundary without any change to
`packages/bolus` (the same 102 bolus tests above still pass unmodified).

`npm run typecheck` passes with zero errors across `packages/shared-types`,
`packages/food-contracts`, `packages/bolus`, `apps/api`, and `apps/web`.

## Bolus package (`packages/bolus`) - 102 tests

```text
✓ test/confirmation.test.ts (12 tests)
✓ test/safety.test.ts (46 tests)
✓ test/calculations.test.ts (14 tests)
✓ test/decimal.test.ts (9 tests)
✓ test/settings.test.ts (16 tests)
✓ test/logging.test.ts (5 tests)
```

Covers every row of the handoff's test matrix (section 10.1): standard meal
dose, correction-only, meal-plus-correction, below-target correction,
active-insulin hard lockout, rounding (half-up, single-pass), no
component-level pre-rounding, raw/rounded maximum-dose refusal, low-glucose
threshold and its immediate-above boundary, stale/future glucose, missing
settings, unit mismatch, incomplete history, active/exact-boundary/future
prior doses, zero-carbohydrate meal vs. correction-only, negative
carbohydrate/active-insulin, hypo symptoms, every special-clinical-situation
enum value, repeated confirmation, expiry (including the exact five-minute
boundary), snapshot mismatch, invalidation, patient mismatch, differing
administration amount, deterministic repeatability (100 repetitions),
property sweep, exact-decimal arithmetic, invalid decimal formats, and
independent mmol/L vs mg/dL configurations.

## Food adapter (`apps/api/test/food.*.test.ts`) - 20 tests

Covers Weet-Bix, apple (exact/whole-word ranking over pure-substring
matches - the "apple/cider" regression), an AFCD solid food, an AFCD liquid,
an AUSNUT household measure, no-result search, a malformed (control-character
and overlong) query, and zero/negative/very-large quantities.

## API integration (`apps/api/test/integration/*.test.ts`, pre-existing) - 12 tests

Food selection → carbohydrate calculation → bolus preview → confirmation;
refusal path (missing settings, low glucose, stale glucose, active
insulin); duplicate-confirmation protection; rejection path; settings
creation and versioning; authenticated history access; user-isolation (RLS
assumptions exercised at the API layer); audit-logging-failure handling.

## End-to-end (`tests/e2e/weetbix-and-refusals.spec.ts`) - 8 tests

The exact 8 scenarios required by `APP_BUILD_PROMPT.md` section 15: Weet-Bix
success path, low-glucose refusal, stale-glucose refusal, missing-settings
refusal, active-insulin scenario, settings-update versioning, duplicate
confirmation, and cross-user isolation - run as black-box HTTP requests
against the actual built and running server (not in-process `inject`).

## What e2e does not yet cover

True browser-DOM Playwright tests of the React PWA are not implemented -
see [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for why (blocked on a
live Supabase project for magic-link auth) and
[`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) for the local Chromium
installation issue encountered on this build host.
