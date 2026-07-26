# Frozen paths

This package implements the deterministic bolus dose arithmetic, the
42-gate fail-closed safety sequence, and the plain-language explanation and
refusal wording shown to the user. All three live inside these same files
(there is no separate "language" module to freeze independently - see
`docs/UPGRADE-bolus-calc.md` §13.2/§2 for why) and are frozen as a single
unit: `packages/bolus/src/` in its entirety, excluding `repositories.ts`'s
`InMemory*` reference implementations (test/dev scaffolding, never
deployed - see that file's own doc comment).

`data/australian_foods.sqlite` and `docs/data-source/` are frozen
alongside it under the same enforcement, since a silent change to the food
database is the same class of risk as a silent change to the dose
arithmetic it feeds.

## Any PR touching a frozen path must

1. Pass the parity harness (`packages/bolus/test/parity/`) with zero
   snapshot diffs, **or** include at least one commit prefixed
   `golden-case:` that updates the affected snapshot(s) deliberately, with
   the clinical/engineering reason in that commit's body.
2. Be approved by a CODEOWNERS reviewer for the path (see `/CODEOWNERS`).
3. Not drop branch coverage below the threshold enforced in
   `packages/bolus/vitest.config.ts` (currently the measured baseline
   captured at PR-1 time - see `docs/UPGRADE-bolus-calc.md`'s PR-1 report
   for what's covered and what isn't, and why).
4. If the change touches `data/australian_foods.sqlite`, also update
   `docs/data-source/australian_foods.sqlite.sha256` in the same PR (see
   `scripts/check-food-db-hash.mjs` and `.github/workflows/ci.yml`).

## Frozen paths

| Path | Why frozen |
|---|---|
| `packages/bolus/src/decimal.ts` | Exact-arithmetic primitive every dose figure is built from |
| `packages/bolus/src/types.ts` | Request/result/refusal contracts and the closed `SpecialSituation` enum |
| `packages/bolus/src/errors.ts` | Refusal → plain-language message templates (`REFUSAL_TEMPLATES`) |
| `packages/bolus/src/settings.ts` | Configuration validation, checksum computation |
| `packages/bolus/src/safety.ts` | The 42-gate fail-closed sequence |
| `packages/bolus/src/calculations.ts` | Dose formulas, the successful-calculation plain-language explanation (`explanationFor`), and full-preview orchestration |
| `packages/bolus/src/confirmation.ts` | Confirmation/rejection/administration-logging gates |
| `data/australian_foods.sqlite` | The bundled food-composition database every carbohydrate calculation reads from |
| `docs/data-source/` | Food-database provenance manifest and hash - must move in lockstep with the database file |

**Excluded** (not frozen): `packages/bolus/src/logging.ts` (operational
log redaction, no effect on a dose figure), `packages/bolus/src/repositories.ts`'s
`InMemory*` classes (test/dev reference doubles only - the interfaces
they implement, `AuditStore`/`SettingsRepository`/`CalculationRepository`/
`Clock`/`IdGenerator`, remain in `types.ts`-adjacent scope conceptually but
are contracts, not arithmetic, and changing them doesn't move a dose
figure by itself).

## Changing a golden case

A parity-harness snapshot (`packages/bolus/test/parity/__snapshots__/*.snap.json`)
or the case that produces it (`packages/bolus/test/parity/cases.ts`) may
only be modified in a commit whose message begins `golden-case:`. CI
checks for this automatically whenever a PR's diff touches
`packages/bolus/test/parity/`; a human CODEOWNERS reviewer is still
required to judge whether the stated reason is actually a deliberate,
reviewed behaviour change and not an accidental one - CI can detect that a
commit *says* it's a deliberate change, not that it *is* one.
