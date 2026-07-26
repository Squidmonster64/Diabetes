# Clinician-review checklist

Reproduced verbatim from `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`
section 12. No item below has been signed off as part of this engineering
build - every checkbox is unchecked pending actual clinician review.

## A. Intended use and patient suitability

- [ ] Rapid-acting mealtime/correction insulin only; no basal, premixed, pump or automated-delivery use.
- [ ] Adult patient population is clinically appropriate.
- [ ] Excluded contexts are complete: pregnancy, paediatrics, sick-day rules, ketones, vomiting/dehydration, exercise, alcohol, steroids and other individual plans.
- [ ] User-facing wording is calculation/review language, not an instruction to inject.
- [ ] The calculator may be used offline under the proposed integrity and audit conditions.

## B. Clinician-configured settings

- [ ] ICR definition and units are correct.
- [ ] ISF definition and units are correct.
- [ ] Target glucose and low threshold are clinically appropriate and target is always above low threshold.
- [ ] Insulin duration is suitable for the prescribed rapid-acting insulin and intended lockout policy.
- [ ] Dose increment matches the user's delivery device.
- [ ] Maximum single calculated dose is clinically appropriate.
- [ ] No clinical defaults should be supplied.
- [ ] Changes require a newly approved immutable configuration.

## C. Formula and boundary decisions

- [ ] Meal dose = carbohydrate grams / ICR plus correction component.
- [ ] Correction = `(current glucose - target) / ISF`.
- [ ] A below-target correction may reduce the meal component while glucose remains above the low threshold.
- [ ] A negative combined result is displayed as zero units.
- [ ] Rounding occurs once, half-up, to the configured increment.
- [ ] Any raw or rounded value above maximum causes refusal rather than capping.
- [ ] A prior rapid-acting dose within insulin duration causes complete refusal.
- [ ] A dose exactly at the duration boundary is treated as no longer active.
- [ ] No insulin-on-board curve is acceptable under the current scope.

## D. Time and measurement controls

- [ ] Approve or replace the proposed 15-minute glucose freshness limit.
- [ ] Approve or replace the proposed five-minute review/confirmation expiry.
- [ ] Define required action where CGM value conflicts with symptoms or rapid change.
- [ ] Define acceptable glucose sources and any fingerstick confirmation conditions.
- [ ] Approve future timestamp, stale timestamp and unreliable-clock refusal behavior.

## E. Refusal and escalation messages

- [ ] Low glucose and hypo symptom messages direct the user to their existing hypo plan without generating a new plan.
- [ ] Active-insulin refusal wording is clinically understandable.
- [ ] Maximum-dose refusal wording gives no hidden or greyed-out dose.
- [ ] Special-situation refusal wording directs the user to their established clinical plan or clinician.
- [ ] Unexpected-error wording is safe and does not imply a dose.

## F. Clinical validation plan

- [ ] Approve a reference dataset containing routine, boundary, adverse and misuse cases.
- [ ] Provide independently calculated expected results for every reference case.
- [ ] Include mmol/L and mg/dL configurations.
- [ ] Include low-threshold, target, duration and maximum-dose exact boundaries.
- [ ] Include negative corrections, zero results and all increment boundaries.
- [ ] Define acceptable agreement and discrepancy handling.
- [ ] Define clinician sign-off roles and revalidation triggers.

## G. Final disposition

- [ ] Approved for continued engineering only.
- [ ] Approved for controlled clinical validation.
- [ ] Approved for production release, subject to regulatory and quality-system evidence.
- [ ] Not approved; changes required are documented.

Clinical reviewer: ____________________
Regulatory reviewer: __________________
Engineering authority: _______________
Decision: [ ] Not approved  [ ] Validation only  [ ] Release subject to conditions

---

See [`SAFETY_GATE_COVERAGE.md`](SAFETY_GATE_COVERAGE.md) for what engineering
has implemented and tested against each of the above, and
[`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for the full list of
unresolved risks this checklist should be read alongside.
