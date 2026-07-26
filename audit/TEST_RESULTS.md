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
| `packages/bolus` (unit) | 6 | 102 | 102 | 0 |
| `apps/api` (unit: food adapter) | 2 | 20 | 20 | 0 |
| `apps/api` (integration: full API) | 5 | 32 | 32 | 0 |
| `apps/web` (unit) | 1 | 2 | 2 | 0 |
| `tests/e2e` (Playwright, black-box HTTP) | 1 | 8 | 8 | 0 |
| **Total** | **15** | **164** | **164** | **0** |

(The `apps/api` "unit" and "integration" rows both run under
`npm run test --workspace apps/api`, which vitest reports as a single 7-file,
52-test run - split above for clarity between the pure food-adapter tests
and the full-server integration tests.)

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

## API integration (`apps/api/test/integration/*.test.ts`) - 32 tests

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
