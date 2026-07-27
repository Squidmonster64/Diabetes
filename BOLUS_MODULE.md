# Bolus module

`packages/bolus` is the framework-independent, deterministic reconstruction
of the Stage 5 reference implementation described in
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`, with the production controls
that document identifies as required (glucose freshness/clock checks,
settings lifecycle/integrity, patient-entered DIA provenance, a closed
special-situation enum, durable repository interfaces, and fault-injection
tests).

It has **no dependency** on React, Supabase, Railway, service workers, food
databases, speech recognition, AI services, browser storage, or network
access - see `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 11.

## Files

| File | Responsibility |
|---|---|
| `decimal.ts` | Exact rational arithmetic (`bigint` numerator/denominator) - no `number`/`parseFloat`/`Math.round` |
| `types.ts` | `ClinicianSettingsRecord`, `BolusCalculationRequest`, result contracts, closed `SpecialSituation` enum |
| `errors.ts` | **Plain-language generation, refusal path**: `REFUSAL_TEMPLATES`, a fixed `RefusalCode` → `{userFacingMessage, refusalCategory, blockingReason, safeNextStep}` map (verbatim from the handoff) |
| `settings.ts` | `validateSettings` - gates 3-5 (missing/expired/revoked/invalid configuration, DIA provenance) |
| `safety.ts` | `runSafetyGates` - gates 1-30, in order, fail-closed |
| `calculations.ts` | **Dose algorithm** (`calculateMealBolus`/`calculateCorrectionBolus`, pure formulas, and `calculateBolusPreview`, full orchestration incl. gates 31-35) **and plain-language generation, successful-calculation path** (`explanationFor()`, the per-line breakdown shown in `BolusPreviewScreen.tsx`'s "Calculation trace") - both live in this one file; there is no separate language module (see `packages/bolus/FROZEN.md`) |
| `confirmation.ts` | `confirmBolus`/`rejectBolusPreview`/`logConfirmedBolus` - gates 36-42 |
| `repositories.ts` | `AuditStore`/`SettingsRepository`/`CalculationRepository` interfaces + an in-memory reference implementation (test/dev only) |
| `logging.ts` | Redaction helpers for operational logs (distinct from the clinical audit trail) |

For an audit or a post-beta fix, `packages/bolus/FROZEN.md` is the
canonical map of which file owns which responsibility (dose algorithm vs.
plain-language vs. the food database in `apps/api/src/food/` +
`data/australian_foods.sqlite`), what regression protection exists
(`packages/bolus/test/parity/`, a golden-case suite run on every CI build),
and what a change to any of them requires before merging.

## Formulas (handoff section 4)

```text
mealComponent       = carbohydrateGrams / icr            (0 in CORRECTION_ONLY mode)
correctionComponent = (currentGlucose - targetGlucose) / isf
combined            = mealComponent + correctionComponent (or just correctionComponent)
unroundedTotal       = max(0, combined)
roundedTotal          = roundHalfUpToIncrement(unroundedTotal, doseIncrementUnits)
```

Rounding happens **once**, after combining components - never per-component.
A raw or rounded total above `maximumDoseUnits` refuses
(`MAXIMUM_DOSE_EXCEEDED`); the dose is never capped.

## The hard active-insulin lockout (conflict C-01)

There is no active-insulin subtraction formula. `activeInsulinAdjustmentUnits`
is always the literal string `"0"` on a successful calculation - it is not a
computed insulin-on-board value. Any positive or potentially active prior
rapid-acting dose (elapsed time `< insulinDurationHours`) refuses with
`ACTIVE_PRIOR_BOLUS` before arithmetic runs. A dose exactly at the duration
boundary (`elapsed >= duration`) is treated as no longer active.

## Versioning and determinism

Every result carries `calculationVersion`, `safetyPolicyVersion`,
`settingsId`, and `settingsVersion`. Identical inputs against an identical
settings version always produce byte-identical output (verified by a
100-repetition determinism test in `packages/bolus/test/calculations.test.ts`).

## Confirmation lifecycle

```text
CALCULATED / CALCULATED_ZERO ──confirm──> USER_CONFIRMED ──administer──> ADMINISTRATION_RECORDED
        │                                        │
        └──reject──> INVALIDATED                 └──(second confirm)──> DUPLICATE_CONFIRMATION
        └──(expiresAt passed)──> EXPIRED
```

A preview expires 5 minutes after creation; confirming **exactly at**
`expiresAt` is accepted, any instant later is refused (handoff conflict
C-07). Confirmation is idempotent - repeated confirmation requests never
create a second confirmed record.

See [`SAFETY_MODEL.md`](SAFETY_MODEL.md) for the full safety-gate reference
and [`audit/SAFETY_GATE_COVERAGE.md`](audit/SAFETY_GATE_COVERAGE.md)
for the gate-by-gate test traceability matrix.
