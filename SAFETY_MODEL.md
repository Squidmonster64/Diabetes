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

## Custom foods and saved meals did not touch the bolus module

`feature/custom-foods-saved-meals` (packet-label/manual custom foods,
reusable multi-food meals with editable quantities, duplication, and
archiving) is a food-side extension only. `packages/bolus/src/` has zero
changed lines from that work - verified by re-running its full 102-test
suite unmodified, and by an explicit integration test
(`apps/api/test/integration/custom-foods-and-meals.test.ts`, "feeds a
meal's confirmed carbohydrate total into the unmodified bolus module") that
creates a meal, computes its total, and feeds that single confirmed number
into `POST /api/v1/bolus/preview` exactly as a single food's carbohydrate
figure would be - the bolus module has no model of "meals," "components," or
"custom foods" at all, matching the boundary described above.

## Natural-language event entry did not touch the bolus module

`packages/natural-language/` (the primary "describe what's happening" entry
screen) is a text -> structured-draft transformer only. It performs
deterministic, regex-based extraction of glucose, recent insulin, food/drink
components, symptoms, and timing from typed or dictated text - Apple keyboard
Dictation inserts recognised text into the same native `<textarea>` used for
typed input, so it is indistinguishable from typing; there is no microphone
API, audio recording, or speech-recognition service anywhere in the app.

This package **never calculates a bolus, never infers an insulin amount or
active-insulin value, and never confirms a value on the user's behalf**:

- Every extracted field carries `{rawSpan, value, confidence, status,
  requiresConfirmation}` and is rendered on `NaturalLanguageReviewScreen.tsx`
  for the user to change or confirm before anything downstream runs.
- A missing or ambiguous required value (an insulin amount stated as bare
  "units", a food quantity that would materially affect carbohydrate, an
  unstated glucose unit, a concentrated-insulin cue) produces a **blocking**
  clarification question; the confirm button is disabled until every
  blocking clarification is resolved (`hasBlockingClarifications`).
- Parsed prior-insulin dose and timestamp only ever populate the *existing*
  `priorRapidActingDoses` array on the bolus preview request
  (`GlucoseEntryScreen.tsx`) - the unmodified `ACTIVE_PRIOR_BOLUS` gate in
  `packages/bolus/src/safety.ts` (gates 18-20) is the only thing that decides
  whether that prior dose blocks a new calculation. The package has zero
  runtime dependency on `packages/bolus` (a single type-only import of the
  closed `SpecialSituation` union in `types.ts`/`detect-symptoms.ts`, erased
  at compile time - confirmed by grepping the compiled output for the
  package name).
- Food/drink components are resolved against custom foods and the
  AUSNUT/AFCD search index (`apps/web/src/lib/foodMatch.ts`) using the same
  confirmed-numeric-carbohydrate boundary described in
  `packages/food-contracts/src/index.ts` - the review screen never displays
  a raw database row, only a name, brand, confidence-derived match reason,
  and a computed carbohydrate figure the user can change.
- `packages/bolus/src/` has zero changed lines from this work - verified by
  re-running its full 102-test suite unmodified alongside the new package's
  own 24 acceptance tests (`packages/natural-language/test/segment-event.test.ts`),
  which include an explicit source-scan test asserting the package's source
  never references `calculateMealBolus`, `calculateCorrectionBolus`,
  `calculateBolusPreview`, or `confirmBolus`.
- The pre-existing manual food-search flow (`/food/search`) is retained
  unchanged as a fallback, reachable from the home screen and from the new
  entry screen.

## Known release blockers

This build closes every gap the handoff marked as a release blocker (glucose
freshness, clock checks, settings lifecycle, durable persistence, RLS,
closed enums, audit tamper tests) **at the engineering level**. It has not
undergone the clinician review, human-factors validation, or regulatory
process the handoff requires before real-world use - see
[`CLINICIAN_REVIEW.md`](CLINICIAN_REVIEW.md) and
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).
