# Calculator trace examples

All examples below were produced by actually running the built
`packages/bolus` module or the live API during this build session - none
are hand-written/fabricated. Base settings (handoff section 10 base
configuration) unless noted: `icr=10 isf=2 targetGlucose=6
insulinDurationHours=4 doseIncrementUnits=0.5 maximumDoseUnits=20
lowGlucoseThreshold=4 glucoseUnit=MMOL_L`.

## 1. Weet-Bix acceptance workflow (`CALCULATED`)

Captured from a live `POST /api/v1/bolus/preview` against the running API
(glucose 10 mmol/L, 17 g carbohydrate from 30 g of Sanitarium Weet-Bix
Hi-Bran, AFCD Release 3):

```json
{
  "status": "CALCULATED",
  "calculationId": "44e8840f-4d8d-49ad-affe-ec4ce2fa76df",
  "mealComponentUnits": "1.7",
  "correctionComponentUnits": "2",
  "activeInsulinAdjustmentUnits": "0",
  "unroundedTotalUnits": "3.7",
  "roundedTotalUnits": "3.5",
  "doseIncrementUnits": "0.5",
  "maximumDoseUnits": "20",
  "warnings": [],
  "explanation": [
    "Meal component: 10 g/U divides confirmed carbohydrate grams = 1.7 U",
    "Correction component: (current glucose - 6) / 2 = 2 U",
    "No active-insulin subtraction is permitted in this scope.",
    "Unrounded total: max(0, combined) = 3.7 U",
    "Rounded once to 0.5 U increment: 3.5 U"
  ],
  "settingsVersion": 1,
  "calculationVersion": "0.6.0",
  "safetyPolicyVersion": "0.6.0",
  "confirmationRequired": true
}
```

Note `3.7` rounds **down** to `3.5` (nearest 0.5 U increment, round-half-up
rule: `3.7 / 0.5 = 7.4`, which rounds to `7`, not `8` - `7 × 0.5 = 3.5`).

## 2. Low-glucose refusal (`REFUSED`, `HYPO_THRESHOLD`)

Captured live, same patient, glucose lowered to 3 mmol/L (at/below the
configured 4 mmol/L threshold):

```json
{
  "status": "REFUSED",
  "refusalCode": "HYPO_THRESHOLD",
  "refusalCategory": "GLUCOSE_SAFETY",
  "userFacingMessage": "The glucose value is at or below the clinician-configured low threshold. Follow the established hypo plan.",
  "blockingReason": "Current glucose is at or below the configured low-glucose threshold.",
  "safeNextStep": "Follow your established hypo plan."
}
```

## 3. Stale-glucose refusal (`REFUSED`, `STALE_GLUCOSE`)

Captured live, glucose timestamp 30 minutes before `calculatedAt` (exceeds
the 15-minute freshness limit):

```json
{
  "status": "REFUSED",
  "refusalCode": "STALE_GLUCOSE",
  "refusalCategory": "INPUT",
  "userFacingMessage": "The glucose value is too old for this calculation. Obtain and confirm a current reading.",
  "blockingReason": "The glucose measurement is older than the configured freshness limit.",
  "safeNextStep": "Obtain and confirm a current glucose reading."
}
```

## 4. Missing-settings refusal (`REFUSED`, `NO_ACTIVE_CONFIGURATION`)

Captured live, a patient identity with no settings version created yet:

```json
{
  "status": "REFUSED",
  "refusalCode": "NO_ACTIVE_CONFIGURATION",
  "refusalCategory": "CONFIGURATION",
  "userFacingMessage": "No active clinician-supplied calculator settings are available.",
  "blockingReason": "No settings version with status ACTIVE was found for this patient.",
  "safeNextStep": "Enter patient-entered settings copied from your current clinician-approved plan."
}
```

## 5. Active-insulin hard lockout (`REFUSED`, `ACTIVE_PRIOR_BOLUS`)

From `packages/bolus/test/safety.test.ts` ("refuses positive active insulin
without subtraction"): `activeInsulinUnits: "2"` with an otherwise-valid
request refuses before any arithmetic runs - `activeInsulinAdjustmentUnits`
never appears in the response, confirming no insulin-on-board subtraction
occurs anywhere in the code path (handoff conflict C-01).

## 6. `CALCULATED_ZERO` (negative combined total clamps to zero)

Computed directly from `calculateMealBolus` (glucose 4.5 mmol/L, 1 g
carbohydrate - a small meal component outweighed by a below-target
correction):

```json
{
  "status": "CALCULATED_ZERO",
  "mealComponentUnits": "0.1",
  "correctionComponentUnits": "-0.75",
  "activeInsulinAdjustmentUnits": "0",
  "unroundedTotalUnits": "0",
  "roundedTotalUnits": "0",
  "explanation": [
    "Meal component: 10 g/U divides confirmed carbohydrate grams = 0.1 U",
    "Correction component: (current glucose - 6) / 2 = -0.75 U",
    "No active-insulin subtraction is permitted in this scope.",
    "Unrounded total: max(0, combined) = 0 U",
    "Rounded once to 0.5 U increment: 0 U"
  ]
}
```

Confirms the combined value (`0.1 + -0.75 = -0.65`) clamps to `0`, never a
negative dose.

## 7. Near-maximum dose (still `CALCULATED`, just under the ceiling)

Computed directly (glucose 6 mmol/L = target, so correction is exactly 0;
195 g carbohydrate):

```json
{
  "status": "CALCULATED",
  "mealComponentUnits": "19.5",
  "correctionComponentUnits": "0",
  "unroundedTotalUnits": "19.5",
  "roundedTotalUnits": "19.5"
}
```

`19.5` is below the configured `maximumDoseUnits: "20"`, so it succeeds. See
`packages/bolus/test/calculations.test.ts` for the corresponding refusal
cases just over this ceiling (`MAXIMUM_DOSE_EXCEEDED`, never capped).
