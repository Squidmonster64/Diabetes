# Build manifest

| Field | Value |
|---|---|
| Commit hash | `dec544af89fba8ab639e6149c215ea7d5b04c67b` (initial commit) |
| Build timestamp | 2026-07-26 (Australia/Perth build session) |
| Node.js / npm | v24.18.0 / 11.16.0 |
| Calculator version | `0.6.0` (`packages/bolus/package.json`, `CALCULATOR_VERSION` in `packages/bolus/src/types.ts`) |
| Safety-policy version | `0.6.0` (`SAFETY_POLICY_VERSION`) |
| Australian food database checksum | `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c` |
| Handoff specification checksum | `4ef8b15bb547fcb193bfa7365376a8505ffd6ffdfa0c8fce9704011474471d5c` |
| Dependency count (all workspaces) | 550 packages (see `SBOM.json`) |

## Test commands and results

```bash
npm run test          # 156 tests, 0 failures (bolus 102 + api 52 + web 2)
npm run test:e2e       # 8 tests, 0 failures
npm run typecheck        # 0 errors across 5 workspaces
```

Full breakdown: [`TEST_RESULTS.md`](TEST_RESULTS.md).
Safety-gate traceability: [`SAFETY_GATE_COVERAGE.md`](SAFETY_GATE_COVERAGE.md).

## Source and handoff hashes

Full inventory: [`SOURCE_HASHES.txt`](SOURCE_HASHES.txt).

## Deployment state

Not yet deployed - see [`DEPLOYMENT_RECORD.md`](DEPLOYMENT_RECORD.md).
Supabase migrations are written and reviewed but not applied to a live
project - see [`RLS_REVIEW.md`](RLS_REVIEW.md) and `SUPABASE_SETUP.md`.

## Known limitations and unresolved risks

Full list: [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md). Headline items:
no independent clinician golden dataset, time-window boundaries pending
clinician approval, no formal risk-management file, RLS not yet exercised
against a live project, no true browser-DOM e2e coverage.

## Clinical disposition

**Not approved for treatment use.** See
[`CLINICIAN_REVIEW_CHECKLIST.md`](CLINICIAN_REVIEW_CHECKLIST.md) - no item
has been signed off.
