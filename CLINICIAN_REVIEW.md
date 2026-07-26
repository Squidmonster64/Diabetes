# Clinician review

**Clinical status: not approved for treatment use.** This is an engineering
prototype requiring clinician review before any real-world use, per
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`'s own audit disposition.

## Review checklist

The full clinician-review checklist from the handoff (section 12) is
reproduced and ready for sign-off at
[`audit/CLINICIAN_REVIEW_CHECKLIST.md`](audit/CLINICIAN_REVIEW_CHECKLIST.md).
It covers:

- intended use and patient suitability;
- clinician-configured settings definitions and units;
- formula and boundary decisions (meal/correction components, rounding,
  maximum-dose refusal, active-insulin lockout);
- time and measurement controls (glucose freshness, review-expiry windows);
- refusal and escalation wording;
- the clinical validation plan (golden dataset, mmol/L and mg/dL coverage,
  boundary cases).

No section of that checklist has been signed off by a clinician as part of
this engineering build. **Do not treat this software as clinically
validated.**

## What engineering has verified

- Every formula, rounding rule, and safety-gate boundary from the handoff is
  implemented and covered by automated tests (102 unit tests in
  `packages/bolus`, 32 integration tests in `apps/api`, 8 black-box e2e
  scenarios in `tests/e2e`) - see
  [`audit/TEST_RESULTS.md`](audit/TEST_RESULTS.md).
- The hard active-insulin lockout (no insulin-on-board estimation) is
  preserved exactly as specified.
- Every conflict the handoff's document-control rule required to be
  recorded (C-01 through C-10) has been resolved per its "required handling"
  column, not silently reinterpreted - see
  [`audit/SAFETY_GATE_COVERAGE.md`](audit/SAFETY_GATE_COVERAGE.md).

## What still requires clinical sign-off before any release

- an independently calculated clinician golden dataset (mmol/L and mg/dL,
  boundary and adverse cases);
- approval or replacement of the proposed 15-minute glucose-freshness limit
  and 5-minute review-expiry window;
- a formal risk-management file and regulatory pathway assessment;
- human-factors/usability validation of the refusal and confirmation
  wording with real patients.

See [`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md) for
the complete list of unresolved risks.
