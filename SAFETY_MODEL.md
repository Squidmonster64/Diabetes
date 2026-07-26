# Safety model

All 42 safety gates from `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`
sections 5.1-5.3 are implemented in `packages/bolus/src/safety.ts`
(gates 1-30) and `packages/bolus/src/confirmation.ts` (gates 36-42), executed
**in order**, fail-closed: once a gate refuses, no later arithmetic runs or
is exposed. Gates 31-35 (arithmetic failure, maximum-dose, audit
persistence, snapshot integrity) live in `packages/bolus/src/calculations.ts`.

See [`audit/SAFETY_GATE_COVERAGE.md`](audit/SAFETY_GATE_COVERAGE.md)
for the full requirement → implementation → test traceability matrix.

## Refusal, not a hidden dose

A refusal (`BolusRefusal`) never carries `mealComponentUnits`,
`correctionComponentUnits`, `unroundedTotalUnits`, or `roundedTotalUnits` -
enforced both by the TypeScript discriminated union and, at the database
layer, by the `calculations_refusal_has_no_dose` check constraint (see
`supabase/migrations/0003_calculations.sql`).

## Emergency escalation

Unconsciousness, inability to swallow, severe hypo symptoms, severe illness,
and other excluded clinical contexts refuse **before** any arithmetic and
direct the user to their established emergency/hypo/sick-day plan. The app
never invents a carbohydrate-treatment quantity, correction dose, ketone
dose, fluid plan, or emergency-medication instruction (handoff section 1.5).
User-facing wording is deliberately cautious and never implies the app
replaces emergency services or clinical advice - see `AboutScreen.tsx` and
`SafetyRefusalScreen.tsx`.

## What is deliberately *not* implemented

Per handoff section 1.2/1.6, the calculator contains no:

- basal, premixed, intravenous, or pump/automated-delivery dosing;
- split/extended/dual-wave boluses;
- paediatric or pregnancy dosing (both refuse via
  `SPECIAL_CLINICAL_SITUATION` unless the deployment's identity system
  explicitly configures adult status - `context.patientIsAdult`);
- sick-day, ketone, vomiting, or dehydration dosing;
- exercise, alcohol, steroid, or renal adjustments;
- an insulin-on-board curve of any kind;
- AI-generated, machine-learned, or adaptive dosing logic of any kind.

## Closed special-situation enum (conflict C-04)

`SpecialSituation` in `packages/bolus/src/types.ts` is a closed TypeScript
union (and a matching Postgres `enum` at the database layer), not the
Stage 5 reference's `readonly string[]`. Any value outside the closed set is
a type error at the API boundary, not a runtime surprise.

## Known release blockers

This build closes every gap the handoff marked as a release blocker (glucose
freshness, clock checks, settings lifecycle, durable persistence, RLS,
closed enums, audit tamper tests) **at the engineering level**. It has not
undergone the clinician review, human-factors validation, or regulatory
process the handoff requires before real-world use - see
[`CLINICIAN_REVIEW.md`](CLINICIAN_REVIEW.md) and
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).
