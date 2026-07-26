# BOLUS CALCULATOR IMPLEMENTATION HANDOFF

**Document version:** 1.1  
**Prepared:** 25 July 2026  
**Source stages:** Clinical Bolus Calculator Stages 1–6  
**Reference implementation:** Stage 5 package, version `0.5.0`  
**Audit disposition:** Not release-ready; engineering prototype only  
**Clinical status:** Not approved for treatment use

This file is the authoritative implementation handoff for reconstructing the clinician-supplied bolus calculator in a separate local app-build session. Insulin duration (DIA) is entered by the patient from current clinician consultation advice or a clinician-provided report and is then explicitly confirmed as accurately transcribed. It consolidates the intended design, implemented Stage 4/5 behavior, Stage 6 audit findings, known gaps, interfaces, tests, and review controls.

It is not a treatment plan, prescription, clinical protocol, regulatory approval, or production-release authorization.

## Document-control rule

Where a specification and the Stage 5 reference implementation differ:

1. the difference is recorded in the conflict register below;
2. the implementation must not silently invent a clinical rule;
3. implemented behavior may be preserved for reference;
4. open safety requirements must be implemented and clinically reviewed before release;
5. any change to a clinical formula or boundary requires a new specification, test evidence, and clinician approval.

## Conflict register

| ID | Conflict | Required handling |
|---|---|---|
| C-01 | The requested handoff asks for active-insulin subtraction, but Stages 1, 2, 4, 5 and 6 explicitly prohibit estimating insulin-on-board from insulin duration alone. The implemented calculator has no active-insulin subtraction formula. | Preserve the hard lockout. A positive or potentially active rapid-acting dose causes refusal. For successful calculations, `activeInsulinAdjustmentUnits` is exactly `"0"`. Do not implement `total - activeInsulin` without a separately specified, clinically approved and validated insulin-action model. |
| C-02 | Stage 2 requires a glucose measurement timestamp, a 15-minute freshness gate and clock-integrity checks. Stage 4/5 `CalculationInput` contains only `calculatedAt`; freshness is not implemented. | Add `glucoseTimestamp` and implement freshness/future/clock gates before any clinical validation. Keep this marked as a release blocker until tested and approved. |
| C-03 | Stage 2/3 assumed direct clinician configuration. The revised product workflow permits the patient to enter insulin duration (DIA) from current clinician consultation advice or a clinician-provided report. The Stage 5 core accepts an unversioned `ClinicianConfiguration` object and does not preserve this provenance. | Production wrapper must validate configuration lifecycle and integrity. DIA must be stored as patient-transcribed clinician-supplied data with source type, optional consultation/report reference, source date, patient accuracy confirmation, entry timestamp and version. No clinician portal is required solely to enter DIA. |
| C-04 | Stage 2 defines a closed special-situation enumeration. Stage 5 accepts `readonly string[]`. | External interfaces must use a closed enum. The reference source remains evidence of the generic gate, not the production boundary. |
| C-05 | Stage 3 specifies persistent tables, API and RLS. Stage 5 uses an in-memory record map and in-memory audit store. | Replace with durable, transactional persistence and enforce patient/clinician roles. Do not deploy the in-memory adapter. |
| C-06 | Stage 3 API examples omit some fields later required by Stage 4/5, including prior-dose records and input confirmations. | Use the consolidated request contract in this document. Stage 5 types are authoritative for implemented calculation behavior; Stage 2/3 add required production metadata. |
| C-07 | Stage 2 says a preview expires after five minutes. Stage 5 permits confirmation exactly at `expiresAt` and refuses only when `confirmedAt > expiresAt`. | Preserve and test the exact implemented boundary unless clinician review changes it: exactly five minutes is accepted; any later instant is refused. |
| C-08 | Stage 1/2 specify that a prior dose exactly at the insulin-duration boundary is no longer considered active. | Preserve: `elapsed < duration` refuses; `elapsed >= duration` permits. |
| C-09 | The requested input list includes glucose trend. Stage 2 says CGM trend arrows and rate-of-change values are not dosing inputs. | Trend may be stored as provenance only. It must not change arithmetic. The clinical action for a rapid trend without symptoms remains an open clinician-review decision. |
| C-10 | Earlier wording described DIA as directly clinician-entered. The approved revision is patient entry from clinician consultation/report. | Treat the clinician advice/report as the clinical source and the patient entry as a transcription event. The app must not derive, recommend or modify DIA. A changed DIA creates a new settings version and invalidates unconfirmed previews. |

---

# 1. Scope and safety boundaries

## 1.1 Intended use

The module calculates a transparent, deterministic rapid-acting insulin bolus preview for an authenticated adult patient using clinician-supplied settings and user-confirmed inputs. DIA may be transcribed directly by the patient from current clinician consultation advice or a clinician-provided report.

Permitted calculation modes:

- meal bolus;
- correction-only bolus;
- meal plus correction.

The module:

- performs arithmetic only;
- exposes all components and rounding;
- requires explicit user review and confirmation;
- records calculation, refusal, confirmation and administration as separate events;
- never administers insulin;
- never communicates with an insulin pump or automated-delivery system;
- never states that insulin must be taken.

Approved style:

> Calculated bolus: 6 units. Review the calculation before confirming.

Prohibited style:

> Take 6 units now.

## 1.2 Non-goals and excluded uses

The module must not provide:

- basal-insulin calculations;
- premixed-insulin calculations;
- intravenous-insulin calculations;
- pump or automated-insulin-delivery control;
- split, extended or dual-wave boluses;
- paediatric dosing;
- pregnancy or gestational-diabetes dosing;
- sick-day dosing;
- ketone-based dosing;
- vomiting or dehydration dosing;
- exercise adjustments;
- alcohol adjustments;
- steroid adjustments;
- renal-function adjustments;
- fat/protein delayed-meal adjustments;
- “catch-up” dosing;
- repeated-correction timing;
- autonomous treatment advice;
- direct natural-language-to-dose conversion.

The reference scope is adult, multiple-daily-injection use of clinician-prescribed rapid-acting insulin only.

## 1.3 Clinician-supplied settings

Only these eight values may affect calculation behavior:

1. insulin-to-carbohydrate ratio;
2. insulin sensitivity factor;
3. target glucose;
4. insulin duration;
5. dose increment;
6. maximum dose;
7. low-glucose threshold;
8. glucose units.

No clinical defaults may ship. The module must not derive or propose these values.

**DIA entry rule:** the patient may enter `insulinDurationHours` directly from current clinician consultation advice or a clinician-provided report. The patient must confirm accurate transcription before activation. The app must not calculate, recommend, infer or modify DIA.

## 1.4 Core refusal conditions

The module refuses without exposing a dose when:

- no valid active clinician-supplied settings version is available;
- a setting is missing or invalid;
- glucose units do not match;
- glucose is missing, malformed, ambiguous, future-dated or stale;
- glucose is at or below the configured low threshold;
- hypo symptoms are declared;
- carbohydrates are missing, malformed, negative or inconsistent with calculation mode;
- glucose or carbohydrate confirmation is missing;
- recent rapid-acting dose history is unavailable or declared incomplete;
- a prior rapid-acting dose may still be active;
- a prior dose is future-dated or invalid;
- insulin may already have been taken for the same event;
- an excluded clinical situation applies;
- the raw or rounded dose exceeds the maximum;
- arithmetic, integrity or audit persistence fails.

A refusal response must not contain a hidden, capped, greyed-out or recoverable numerical dose.

## 1.5 Emergency escalation conditions

The calculator must not attempt arithmetic for:

- unconsciousness;
- seizure;
- inability to swallow safely;
- severe hypoglycaemia or severe hypo symptoms;
- severe illness;
- persistent vomiting;
- ketones where an individual sick-day or ketone plan applies;
- acute dehydration;
- any situation the user identifies as an emergency.

Required behavior:

- refuse calculation;
- display no dose;
- state that the calculator is not appropriate;
- direct the user to their established emergency/hypo/sick-day plan;
- advise urgent assistance or local emergency services when immediate danger is present;
- log the refusal category without generating a treatment plan.

The app must not invent carbohydrate treatment quantities, correction doses, ketone doses, fluid plans, or emergency medication instructions.

## 1.6 Explicit prohibited logic

The implementation must contain:

- **no AI-generated dosing logic;**
- **no treatment-plan generation;**
- **no machine-learning dose adjustment;**
- no adaptive ICR or ISF;
- no learned response from past doses;
- no generative model in the calculation path;
- no natural-language inference of a dose;
- no autonomous dose scheduling;
- no insulin-on-board curve under the current scope.

---

# 2. User-configured settings

“User-configured” means personalised settings whose clinical source is the treating clinician. Insulin duration (DIA) may be entered by the patient from current clinician consultation advice or a clinician-provided report. The patient confirms accurate transcription; the value is then stored in an immutable, versioned settings record. The app supplies no default and does not recommend or alter the value.

| Setting | Field name | Type | Validation rule | Units | Required | Source of truth | Error handling |
|---|---|---|---|---|---|---|---|
| Insulin-to-carbohydrate ratio | `icr` | canonical decimal string | finite decimal; `> 0`; no exponent or locale-formatted value | grams per unit (`g/U`) | Yes | Active immutable clinician configuration | Refuse `INVALID_CONFIGURATION`; no default or derivation |
| Insulin sensitivity factor | `isf` | canonical decimal string | finite decimal; `> 0` | configured glucose unit per unit of insulin | Yes | Active immutable clinician configuration | Refuse `INVALID_CONFIGURATION` |
| Target glucose | `targetGlucose` | canonical decimal string | finite decimal; must be `> lowGlucoseThreshold` | `mmol/L` or `mg/dL` | Yes | Active immutable clinician configuration | Refuse `INVALID_CONFIGURATION` |
| Insulin duration | `insulinDurationHours` | canonical decimal string | finite decimal; `> 0`; patient accuracy confirmation required; source type required | hours | Yes | Patient transcription from current clinician consultation advice or clinician-provided report, stored as an active immutable settings version | Refuse `INVALID_CONFIGURATION`; no default; do not activate without provenance and confirmation; must not be converted into an IOB curve |
| Dose increment | `doseIncrementUnits` | canonical decimal string | finite decimal; `> 0`; must be `<= maximumDoseUnits` | insulin units | Yes | Active immutable clinician configuration and delivery-device capability | Refuse `INVALID_CONFIGURATION` |
| Maximum dose | `maximumDoseUnits` | canonical decimal string | finite decimal; `> 0`; `>= doseIncrementUnits` | insulin units | Yes | Active immutable clinician configuration | Refuse `INVALID_CONFIGURATION`; never cap |
| Low-glucose threshold | `lowGlucoseThreshold` | canonical decimal string | finite decimal; must be `< targetGlucose` | configured glucose unit | Yes | Active immutable clinician configuration | Refuse `INVALID_CONFIGURATION` |
| Glucose units | `glucoseUnit` | enum | exactly `MMOL_L` or `MG_DL`; all glucose settings and input must match | enum representing `mmol/L` or `mg/dL` | Yes | Active immutable clinician configuration | Refuse `UNIT_MISMATCH` or `INVALID_CONFIGURATION`; no silent conversion |

## 2.1 Configuration metadata required in production

The production configuration object must also contain:

```ts
interface ClinicianSettingsRecord {
  id: string;
  patientId: string;
  version: number;
  status: "DRAFT" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED";
  schemaVersion: string;
  approvedBy: string;
  approvedAt: string;
  effectiveAt: string;
  expiresAt?: string;
  configurationChecksum: string;
  createdAt: string;

  insulinDurationEntrySource:
    | "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION"
    | "PATIENT_ENTERED_FROM_CLINICIAN_REPORT";
  insulinDurationSourceDate?: string;
  insulinDurationSourceReference?: string;
  insulinDurationEnteredAt: string;
  insulinDurationPatientConfirmedAccurate: true;
  insulinDurationPatientConfirmedAt: string;

  icr: string;
  isf: string;
  targetGlucose: string;
  insulinDurationHours: string;
  doseIncrementUnits: string;
  maximumDoseUnits: string;
  lowGlucoseThreshold: string;
  glucoseUnit: "MMOL_L" | "MG_DL";
}
```

Only one configuration may be `ACTIVE` for a patient. Active configurations are immutable. Changes create a new version and supersede the previous version atomically.

### 2.2 Patient-entered DIA workflow

1. The patient opens personalised calculator settings.
2. The patient selects the source:
   - clinician consultation; or
   - clinician-provided report/letter.
3. The patient enters DIA in hours.
4. The patient may record the consultation/report date and a non-sensitive reference label.
5. The app displays the entered value and source for review.
6. The patient confirms: “This DIA matches my current clinician advice.”
7. Activation creates a new immutable settings version.
8. Any later change creates another version and invalidates any unconfirmed bolus preview.
9. The app never suggests a DIA value and never converts DIA into an insulin-on-board curve.


---

# 3. Calculation inputs

| Input | Field name | Type | Validation | Required | Refusal behavior |
|---|---|---|---|---|---|
| Calculation mode | `mode` | `"MEAL" | "CORRECTION_ONLY"` | Closed enum | Yes | `INVALID_INPUT` |
| Carbohydrate grams | `carbohydrateGrams` | canonical decimal string | finite; `>= 0`; meal mode requires `> 0`; correction-only requires `= 0` | Yes | `INVALID_INPUT` or `UNCONFIRMED_CARBOHYDRATES` |
| Current glucose | `currentGlucose` | canonical decimal string | finite; `> 0`; unambiguous; confirmed | Yes | `MISSING_INPUT`, `INVALID_INPUT` or `UNCONFIRMED_GLUCOSE` |
| Glucose units | `glucoseUnit` | enum | must equal active configuration | Yes | `UNIT_MISMATCH` |
| Glucose timestamp | `glucoseTimestamp` | RFC 3339 timestamp | valid; not future-dated; proposed age `<= 15 minutes`; trusted clock | Yes in production | `STALE_GLUCOSE`, `FUTURE_GLUCOSE_TIMESTAMP`, `UNRELIABLE_DEVICE_TIME`; not present in Stage 5 source |
| Calculation timestamp | `calculatedAt` | RFC 3339 timestamp | valid; timezone present; trusted clock | Yes | `INVALID_INPUT` or `UNRELIABLE_DEVICE_TIME` |
| Glucose source | `glucoseSource` | enum | `FINGERSTICK`, `CGM`, or `MANUAL_TRANSCRIPTION` | Yes in production | `INVALID_INPUT` if unsupported |
| Active insulin | `activeInsulinUnits` | nullable canonical decimal string | current scope accepts only `null` or `"0"` as a successful path; positive, negative, malformed or model-derived values cannot be subtracted | Required as an explicit declaration in the consolidated API | Positive/potentially active: `ACTIVE_PRIOR_BOLUS`; malformed/negative: `INVALID_INPUT` |
| Recent history availability | `recentHistoryComplete` | boolean | must be `true` | Yes for all modes in current implementation | `RECENT_BOLUS_HISTORY_INCOMPLETE` |
| Prior rapid-acting doses | `priorRapidActingDoses` | array of `{units, administeredAt}` | each dose `> 0`; valid timestamp; not future; elapsed time evaluated against insulin duration | Yes; empty array allowed | `INVALID_INPUT`, `FUTURE_PRIOR_BOLUS` or `ACTIVE_PRIOR_BOLUS` |
| Glucose trend | `glucoseTrend` | optional enum/provenance | may be stored but must not enter arithmetic | Optional | No dose adjustment. Symptom conflict refuses under `HYPO_SYMPTOMS`; rapid-trend-only policy requires clinician approval |
| Glucose confirmation | `glucoseConfirmed` | boolean | must be `true` | Yes | `UNCONFIRMED_GLUCOSE` |
| Carbohydrate confirmation | `carbohydratesConfirmed` | boolean | must be `true` | Yes | `UNCONFIRMED_CARBOHYDRATES` |
| Duplicate-event declaration | `duplicateDose` | boolean | must be `false` | Yes | `DUPLICATE_EVENT_RISK` |
| Hypo symptoms | `hypoSymptoms` | boolean | must be `false` | Yes | `HYPO_SYMPTOMS` |
| Special situations | `specialSituations` | closed enum array | must be empty | Yes | `SPECIAL_CLINICAL_SITUATION` |
| User review state | `confirmationState` | workflow state | preview must be current, unexpired, unchanged and explicitly confirmed | Required after calculation | Expired, invalidated, duplicate or snapshot mismatch |

## 3.1 Closed special-situation enum

```ts
type SpecialSituation =
  | "SICK_DAY"
  | "SEVERE_ILLNESS"
  | "KETONES"
  | "VOMITING"
  | "DEHYDRATION"
  | "PREGNANCY"
  | "PAEDIATRIC_USE"
  | "EXERCISE_ADJUSTMENT"
  | "ALCOHOL_ADJUSTMENT"
  | "STEROID_ADJUSTMENT"
  | "PUMP_OR_AID"
  | "BASAL_OR_PREMIXED_INSULIN"
  | "CONCENTRATED_INSULIN_AMBIGUITY"
  | "UNCONSCIOUS_OR_UNABLE_TO_SWALLOW"
  | "OTHER_TREATMENT_PLAN";
```

The Stage 5 reference uses `readonly string[]`. Production external boundaries must enforce the closed enum above.

---

# 4. Deterministic formulas

Use arbitrary-precision decimal or exact fixed-point/rational arithmetic. Do not use JavaScript `number`, `parseFloat()` or `Math.round()` for authoritative clinical arithmetic.

Let:

```text
C = confirmed carbohydrate grams
R = clinician-configured insulin-to-carbohydrate ratio (g/U)
G = confirmed current glucose
T = clinician-configured target glucose
S = clinician-configured insulin sensitivity factor
Q = clinician-configured dose increment
M = clinician-configured maximum dose
L = clinician-configured low-glucose threshold
A = active-insulin adjustment
```

## 4.1 Meal component

```text
mealComponent = C / R
```

In correction-only mode:

```text
mealComponent = 0
```

## 4.2 Correction component

```text
correctionComponent = (G - T) / S
```

`G`, `T` and `S` must use the same configured glucose unit.

## 4.3 Active-insulin subtraction

### Completed-design rule

There is **no active-insulin subtraction formula** in the approved six-stage design.

The successful-path value is:

```text
activeInsulinAdjustment = 0
```

This value is zero only after the safety layer has established that no prior rapid-acting dose is within the patient-entered, clinician-supplied DIA and that recent history is complete.

The following formula is prohibited under the current scope:

```text
preRoundingTotal = mealComponent + correctionComponent - activeInsulin
```

Reason: insulin duration alone does not define a clinically valid insulin-action curve or remaining-insulin estimate.

Implemented active-insulin behavior:

```text
if any prior rapid-acting dose has elapsed time < insulinDuration:
    REFUSE ACTIVE_PRIOR_BOLUS

if elapsed time >= insulinDuration:
    dose is not treated as active by this calculator
```

A future insulin-on-board feature requires a separately approved action model, new settings, new formulas, risk analysis, tests and clinician validation.

## 4.4 Pre-rounding total

Meal mode:

```text
combined = mealComponent + correctionComponent
preRoundingTotal = max(0, combined)
```

Correction-only mode:

```text
combined = correctionComponent
preRoundingTotal = max(0, combined)
```

Because active insulin cannot coexist with a successful calculation:

```text
unroundedTotal = preRoundingTotal
activeInsulinAdjustment = 0
```

## 4.5 Rounding to configured increment

Round once, after all components are combined, using round-half-up:

```text
incrementCount = floor((unroundedTotal / Q) + 0.5)
roundedTotal = incrementCount × Q
```

Do not round meal and correction components separately.

## 4.6 Maximum-dose handling

```text
if unroundedTotal > M:
    REFUSE MAXIMUM_DOSE_EXCEEDED

roundedTotal = roundHalfUpToIncrement(unroundedTotal, Q)

if roundedTotal > M:
    REFUSE MAXIMUM_DOSE_EXCEEDED
```

Never cap to `M`.

## 4.7 Boundary behavior

### Current glucose below target

When:

```text
L < G < T
```

the correction component is negative and may reduce a meal bolus.

### Negative correction values

Negative correction values are allowed in meal mode while glucose remains above the low threshold.

In correction-only mode, a negative correction produces a zero result after clamping.

### Negative total

```text
if combined < 0:
    unroundedTotal = 0
```

Return `CALCULATED_ZERO`, not a negative dose and not a carbohydrate-treatment recommendation.

### Zero carbohydrates

- `MEAL` with `C = 0` → refuse `INVALID_INPUT`.
- `CORRECTION_ONLY` with `C = 0` → valid.
- `CORRECTION_ONLY` with `C != 0` → refuse `INVALID_INPUT`.

### Active insulin exceeds calculated total

No subtraction is performed. Any positive or potentially active insulin causes refusal before the arithmetic result is exposed. The system does not return zero by subtracting active insulin from the total.

### Exact insulin-duration boundary

- `elapsed < duration` → refusal;
- `elapsed >= duration` → permitted.

---

# 5. Safety gates

Gates execute in order and fail closed. Once a gate refuses, later arithmetic must not execute or be exposed.

Severity terms are preliminary engineering classifications pending the formal risk-management process.

## 5.1 Pre-calculation and clinical gates

| Order | Gate | Trigger condition | Severity | Result | User-facing message | Logging code | Implementation status |
|---:|---|---|---|---|---|---|---|
| 1 | Application integrity | Build/signature/integrity check fails | Critical | Refuse | “Calculator integrity could not be verified. No calculation was produced.” | `APPLICATION_INTEGRITY_FAILURE` | Required before release |
| 2 | Authentication/patient binding | No authenticated patient or patient mismatch | Critical | Refuse | “This calculation is not available for this account.” | `UNAUTHENTICATED` / `PATIENT_MISMATCH` | Patient binding implemented; auth external |
| 3 | Missing active settings | No active clinician-supplied settings version | Critical | Refuse | “No active clinician-supplied calculator settings are available.” | `NO_ACTIVE_CONFIGURATION` | Required wrapper |
| 4 | Settings lifecycle/integrity | Revoked, expired, unsupported, unapproved or checksum invalid | Critical | Refuse | “The clinical settings cannot be verified. No calculation was produced.” | `CONFIGURATION_EXPIRED`, `CONFIGURATION_REVOKED`, `CONFIGURATION_INTEGRITY_FAILURE`, `UNSUPPORTED_CONFIGURATION_VERSION` | Required before release |
| 5 | Missing/invalid settings | Required setting absent, malformed, non-positive, maximum below increment, target not above low threshold, or DIA lacks patient-confirmed clinician-source provenance | Critical | Refuse | “The calculator settings are incomplete, invalid, or not confirmed from current clinician advice.” | `INVALID_CONFIGURATION` | Numeric checks implemented; DIA provenance wrapper required |
| 6 | Input schema | Missing, malformed, ambiguous, locale-formatted or exponential numeric input | High | Refuse | “One or more required values are missing or invalid.” | `MISSING_INPUT` / `INVALID_INPUT` | Partly implemented |
| 7 | Invalid glucose units | Input units differ from configuration or unsupported unit | Critical | Refuse | “The glucose units do not match the clinician settings.” | `UNIT_MISMATCH` | Implemented |
| 8 | Unconfirmed glucose | `glucoseConfirmed !== true` | Critical | Refuse | “Confirm the current glucose value before calculating.” | `UNCONFIRMED_GLUCOSE` | Implemented |
| 9 | Unconfirmed carbohydrates | `carbohydratesConfirmed !== true` | High | Refuse | “Confirm the carbohydrate grams before calculating.” | `UNCONFIRMED_CARBOHYDRATES` | Implemented |
| 10 | Missing/ambiguous current glucose | Empty, non-numeric, non-finite, `<= 0`, or no clear current reading | Critical | Refuse | “Enter and confirm one current glucose value.” | `MISSING_INPUT` / `INVALID_INPUT` | Numeric part implemented |
| 11 | Future glucose | `glucoseTimestamp > calculatedAt` | Critical | Refuse | “The glucose timestamp is in the future. Check the device time and measurement.” | `FUTURE_GLUCOSE_TIMESTAMP` | Required before release |
| 12 | Stale glucose | Proposed: `calculatedAt - glucoseTimestamp > 15 minutes` | Critical | Refuse | “The glucose value is too old for this calculation. Obtain and confirm a current reading.” | `STALE_GLUCOSE` | Required; clinician approval pending |
| 13 | Unreliable clock | Clock rollback, missing timezone or inconsistent elapsed-time calculation | Critical | Refuse | “The device time cannot be verified. No calculation was produced.” | `UNRELIABLE_DEVICE_TIME` | Required before release |
| 14 | Invalid carbohydrate amount | Negative/malformed; meal mode `<= 0`; correction-only `!= 0` | High | Refuse | “The carbohydrate amount is invalid for the selected calculation mode.” | `INVALID_INPUT` | Implemented |
| 15 | Duplicate-event risk | User says insulin may already have been taken for the same meal/correction | Critical | Refuse | “A dose may already have been taken for this event. No calculation was produced.” | `DUPLICATE_EVENT_RISK` | Implemented |
| 16 | Recent history unavailable | `recentHistoryComplete !== true` | Critical | Refuse | “Recent rapid-acting insulin history is incomplete. No calculation was produced.” | `RECENT_BOLUS_HISTORY_INCOMPLETE` | Implemented for all modes |
| 17 | Invalid active insulin | Negative, malformed or unsupported numeric active-insulin value | Critical | Refuse | “Active insulin cannot be validated by this calculator.” | `INVALID_INPUT` | Consolidated wrapper required |
| 18 | Invalid prior-dose record | Dose `<= 0`, malformed timestamp or malformed units | Critical | Refuse | “A recent insulin record is invalid. No calculation was produced.” | `INVALID_INPUT` | Implemented |
| 19 | Future prior dose | Prior dose timestamp is after calculation time | Critical | Refuse | “A recent insulin timestamp is in the future. Check the dose history and device time.” | `FUTURE_PRIOR_BOLUS` | Implemented |
| 20 | Potentially active prior insulin | Any prior rapid-acting dose has elapsed time `< insulinDurationHours` | Critical | Refuse | “Calculation unavailable because a previous rapid-acting dose may still be active.” | `ACTIVE_PRIOR_BOLUS` | Implemented/tested |
| 21 | Severe hypoglycaemia/unconsciousness | Unconscious, seizure, unable to swallow, or severe hypo declared | Critical/emergency | Refuse and escalate | “Do not use this calculator. Follow the emergency hypo plan and obtain urgent assistance.” | `HYPO_SYMPTOMS` | UI declaration/enumeration required |
| 22 | Hypo symptoms | Any declared hypo symptoms | Critical | Refuse | “No bolus calculation was provided. Follow the established hypo plan.” | `HYPO_SYMPTOMS` | Implemented |
| 23 | Low glucose | `G <= L` | Critical | Refuse | “The glucose value is at or below the clinician-configured low threshold. Follow the established hypo plan.” | `HYPO_THRESHOLD` | Implemented/tested |
| 24 | Severe illness | Severe illness or acute deterioration declared | Critical | Refuse and escalate | “This calculator is not appropriate during severe illness. Follow the established sick-day plan or obtain urgent clinical assistance.” | `SPECIAL_CLINICAL_SITUATION` | Generic gate implemented |
| 25 | Vomiting/dehydration | Vomiting or dehydration declared | Critical | Refuse | “This calculator is not appropriate in this situation. Follow the established sick-day plan or contact the treating team.” | `SPECIAL_CLINICAL_SITUATION` | Generic gate implemented |
| 26 | Ketones | Ketones or ketone-plan context declared | Critical | Refuse | “Use the established ketone or sick-day plan. This calculator will not calculate a dose.” | `SPECIAL_CLINICAL_SITUATION` | Generic gate implemented |
| 27 | Paediatric use | Patient is not an explicitly configured adult under current scope | Critical | Refuse | “This calculator is not configured for paediatric use.” | `SPECIAL_CLINICAL_SITUATION` | Scope exclusion; identity enforcement required |
| 28 | Pregnancy use | Pregnancy/gestational context declared | Critical | Refuse | “This calculator is not configured for pregnancy-related dosing.” | `SPECIAL_CLINICAL_SITUATION` | Generic gate implemented |
| 29 | Concentrated insulin ambiguity | Insulin concentration/type cannot be confirmed as intended rapid-acting product | Critical | Refuse | “The insulin type or concentration is unclear. No calculation was produced.” | `SPECIAL_CLINICAL_SITUATION` | Required UI gate |
| 30 | Other excluded clinical context | Pump/AID, basal/premixed, exercise, alcohol, steroid or other plan applies | Critical | Refuse | “This calculation is outside the configured scope. Follow the established clinical plan.” | `SPECIAL_CLINICAL_SITUATION` | Generic gate implemented |

## 5.2 Calculation and persistence gates

| Order | Gate | Trigger | Severity | Result | Message | Logging code | Status |
|---:|---|---|---|---|---|---|---|
| 31 | Arithmetic failure | Decimal parse/operation or unexpected exception | Critical | Refuse | “The calculation could not be completed safely. No dose was produced.” | `ARITHMETIC_FAILURE` | Implemented |
| 32 | Raw maximum | `unroundedTotal > maximumDoseUnits` | Critical | Refuse; do not cap | “The calculated amount exceeds the clinician-configured maximum. No dose was produced.” | `MAXIMUM_DOSE_EXCEEDED` | Implemented/tested |
| 33 | Rounded maximum | `roundedTotal > maximumDoseUnits` | Critical | Refuse; do not cap | Same as above | `MAXIMUM_DOSE_EXCEEDED` | Implemented/tested |
| 34 | Audit persistence | Calculation-start, refusal or completion event cannot be durably stored | High/Critical | Refuse/no display | “The calculation could not be recorded safely. No result was displayed.” | `AUDIT_PERSISTENCE_FAILURE` | Fail-before-display pattern implemented; durable store open |
| 35 | Snapshot creation/integrity | Review snapshot cannot be hashed or reconstructed | High | Refuse/no confirmation | “The calculation review cannot be verified. Recalculate.” | `APPLICATION_INTEGRITY_FAILURE` / `SNAPSHOT_MISMATCH` | Snapshot implemented |

## 5.3 Confirmation gates

| Order | Gate | Trigger | Severity | Result | Message | Code |
|---:|---|---|---|---|---|---|
| 36 | Patient mismatch | Confirming user does not own calculation | Critical | Reject confirmation | “This calculation cannot be confirmed by this account.” | `PATIENT_MISMATCH` |
| 37 | Not confirmable | Refused, expired, invalidated or otherwise non-preview state | High | Reject | “This calculation cannot be confirmed.” | `NOT_CONFIRMABLE` |
| 38 | Expired preview | `confirmedAt > expiresAt` | High | Mark expired and reject | “The calculation has expired. Re-enter current values and calculate again.” | `CALCULATION_EXPIRED` |
| 39 | Changed snapshot | Submitted hash differs from stored snapshot | High | Reject | “The calculation inputs or settings changed. Recalculate.” | `SNAPSHOT_MISMATCH` |
| 40 | Duplicate confirmation | Already confirmed or administration recorded | High | Reject | “This calculation has already been confirmed.” | `DUPLICATE_CONFIRMATION` |
| 41 | Explicit text not accepted | `confirmed !== true` or `confirmationTextAccepted !== true` | High | Reject | “Review and acknowledge the calculation before confirming.” | `NOT_CONFIRMABLE` |
| 42 | Administration validation | Administration not positive, timestamp invalid, not confirmed, or duplicate | High | Reject administration | “The administration record is invalid.” | `INVALID_ADMINISTRATION` |

---

# 6. Result contract

## 6.1 Success output

```ts
interface BolusSuccess {
  status: "CALCULATED" | "CALCULATED_ZERO";
  calculationId: string;

  mealComponentUnits: string;
  correctionComponentUnits: string;
  activeInsulinAdjustmentUnits: "0";
  unroundedTotalUnits: string;
  roundedTotalUnits: string;

  doseIncrementUnits: string;
  maximumDoseUnits: string;
  warnings: readonly WarningCode[];
  explanation: readonly string[];

  settingsId: string;
  settingsVersion: number;
  calculationVersion: string;
  safetyPolicyVersion: string;
  timestamp: string;
  expiresAt: string;
  snapshotHash: string;
  confirmationRequired: true;
}
```

`activeInsulinAdjustmentUnits` is `"0"` because the current scope refuses any potentially active prior dose. It is not a calculated IOB value.

Example:

```json
{
  "status": "CALCULATED",
  "calculationId": "calc_01JEXAMPLE",
  "mealComponentUnits": "4",
  "correctionComponentUnits": "2",
  "activeInsulinAdjustmentUnits": "0",
  "unroundedTotalUnits": "6",
  "roundedTotalUnits": "6",
  "doseIncrementUnits": "0.5",
  "maximumDoseUnits": "20",
  "warnings": [],
  "explanation": [
    "Meal component: 40 g / 10 g/U = 4 U",
    "Correction component: (10 - 6) / 2 = 2 U",
    "No active-insulin subtraction is permitted in this scope.",
    "Unrounded total: max(0, 4 + 2) = 6 U",
    "Rounded once to 0.5 U: 6 U"
  ],
  "settingsId": "cfg_123",
  "settingsVersion": 1,
  "calculationVersion": "0.5.0",
  "safetyPolicyVersion": "0.5.0",
  "timestamp": "2026-07-24T04:00:00.000Z",
  "expiresAt": "2026-07-24T04:05:00.000Z",
  "snapshotHash": "sha256:example",
  "confirmationRequired": true
}
```

## 6.2 Refusal output

```ts
interface BolusRefusal {
  status: "REFUSED";
  refusalCode: RefusalCode;
  refusalCategory:
    | "CONFIGURATION"
    | "INPUT"
    | "GLUCOSE_SAFETY"
    | "ACTIVE_INSULIN"
    | "CLINICAL_CONTEXT"
    | "MAXIMUM_DOSE"
    | "INTEGRITY"
    | "CONFIRMATION";
  userFacingMessage: string;
  blockingReason: string;
  safeNextStep: string;
  settingsId?: string;
  settingsVersion?: number;
  calculationVersion: string;
  safetyPolicyVersion: string;
  timestamp: string;
}
```

Example:

```json
{
  "status": "REFUSED",
  "refusalCode": "ACTIVE_PRIOR_BOLUS",
  "refusalCategory": "ACTIVE_INSULIN",
  "userFacingMessage": "Calculation unavailable because a previous rapid-acting dose may still be active.",
  "blockingReason": "A prior rapid-acting dose occurred within the clinician-configured insulin duration. This calculator does not estimate insulin-on-board.",
  "safeNextStep": "Do not use this calculator for the current event. Follow the clinician-approved plan or contact the treating team.",
  "settingsId": "cfg_123",
  "settingsVersion": 1,
  "calculationVersion": "0.5.0",
  "safetyPolicyVersion": "0.5.0",
  "timestamp": "2026-07-24T04:00:00.000Z"
}
```

A refusal object must not contain `mealComponentUnits`, `correctionComponentUnits`, `unroundedTotalUnits` or `roundedTotalUnits`.

## 6.3 Warning policy

Warnings must not replace blocking gates. Under the completed design, safety uncertainty generally refuses rather than warns.

Permitted non-dosing warnings include:

- offline record pending synchronisation;
- result is a calculation, not proof of administration;
- source provenance is user-entered or database-estimated.

No warning may alter arithmetic.

---

# 7. Data model

All clinical history objects are append-only or immutable after activation/creation.

## 7.1 Clinician settings

**Table:** `clinician_configurations`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `patient_id` | UUID | Foreign key to patient/profile |
| `version` | integer | Unique with `patient_id` |
| `status` | enum | Draft/approved/active/superseded/revoked/expired |
| `icr` | decimal/string | Required, `> 0` |
| `isf` | decimal/string | Required, `> 0` |
| `target_glucose` | decimal/string | Required |
| `insulin_duration_hours` | decimal/string | Required, `> 0` |
| `insulin_duration_entry_source` | enum | `PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION` or `PATIENT_ENTERED_FROM_CLINICIAN_REPORT` |
| `insulin_duration_source_date` | date nullable | Consultation/report date when available |
| `insulin_duration_source_reference` | text nullable | Non-sensitive label, e.g. “Clinic letter May 2026” |
| `insulin_duration_entered_at` | timestamp | Required |
| `insulin_duration_patient_confirmed_accurate` | boolean | Must be true before activation |
| `insulin_duration_patient_confirmed_at` | timestamp | Required before activation |
| `dose_increment_units` | decimal/string | Required, `> 0` |
| `maximum_dose_units` | decimal/string | Required, `>= increment` |
| `low_glucose_threshold` | decimal/string | Required, `< target` |
| `glucose_unit` | enum | `MMOL_L` or `MG_DL` |
| `schema_version` | string | Required |
| `approved_by` | UUID/string nullable | Clinical approver where a direct approval workflow exists; not required solely for patient transcription of DIA from clinician advice/report |
| `approved_at` | timestamp nullable | Required where direct clinical approval is recorded |
| `effective_at` | timestamp | Required |
| `expires_at` | timestamp nullable | Optional |
| `superseded_at` | timestamp nullable | Optional |
| `revoked_at` | timestamp nullable | Optional |
| `configuration_checksum` | string | Required before use |
| `created_at` | timestamp | Required |

Relationship: one patient has many setting versions; exactly one may be active.

## 7.2 Calculation request

**Table:** `calculation_requests`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `patient_id` | UUID | Foreign key |
| `configuration_id` | UUID | Foreign key |
| `mode` | enum | Required |
| `current_glucose` | decimal/string | Required |
| `glucose_unit` | enum | Required |
| `glucose_source` | enum | Required |
| `glucose_timestamp` | timestamp | Required in production |
| `glucose_confirmed` | boolean | Must be true |
| `glucose_trend` | enum nullable | Provenance only |
| `carbohydrate_grams` | decimal/string | Required |
| `carbohydrates_confirmed` | boolean | Must be true |
| `carbohydrate_provenance` | JSON | Food database/user provenance; no food semantics in core |
| `active_insulin_units` | decimal/string nullable | Current scope permits only null/zero on successful path |
| `recent_history_complete` | boolean | Must be true |
| `prior_rapid_acting_doses_snapshot` | JSON array | Immutable snapshot |
| `hypo_symptoms` | boolean | Required |
| `duplicate_dose` | boolean | Required |
| `special_situations` | enum array | Required |
| `calculated_at` | timestamp | Required |
| `input_checksum` | string | Required |
| `created_at` | timestamp | Required |

Relationship: one request has one result.

## 7.3 Calculation result

**Table:** `calculations`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `request_id` | UUID | Unique foreign key |
| `patient_id` | UUID | Foreign key |
| `configuration_id` | UUID | Foreign key |
| `status` | enum | Calculated/calculated-zero/refused/expired/invalidated |
| `meal_component_units` | decimal/string nullable | Null on refusal |
| `correction_component_units` | decimal/string nullable | Null on refusal |
| `active_insulin_adjustment_units` | decimal/string nullable | `"0"` on success; null on refusal |
| `unrounded_total_units` | decimal/string nullable | Null on refusal |
| `rounded_total_units` | decimal/string nullable | Null on refusal |
| `dose_increment_units` | decimal/string nullable | Snapshot |
| `maximum_dose_units` | decimal/string nullable | Snapshot |
| `refusal_code` | enum nullable | Required for refusal |
| `explanation` | JSON array | No imperative dosing text |
| `warnings` | JSON array | Non-dosing only |
| `configuration_version` | integer | Required |
| `calculator_version` | string | Required |
| `safety_policy_version` | string | Required |
| `created_at` | timestamp | Required |
| `expires_at` | timestamp nullable | Required on success |
| `result_checksum` | string | Required |

## 7.4 Refusal event

**Table/object:** `refusal_events`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `calculation_id` | UUID | Foreign key |
| `patient_id` | UUID | Foreign key |
| `refusal_code` | enum | Required |
| `refusal_category` | enum | Required |
| `user_message` | text | Required |
| `blocking_reason` | text | Required |
| `safe_next_step` | text | Required; no generated treatment plan |
| `occurred_at` | timestamp | Required |
| `event_checksum` | string | Required |

A separate table is optional if represented as an immutable audit event plus refused calculation; the logical object must still exist.

## 7.5 Confirmation event

**Table:** `calculation_confirmations`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `calculation_id` | UUID | Unique foreign key |
| `patient_id` | UUID | Foreign key |
| `confirmed` | boolean | Must be true |
| `confirmation_text_accepted` | boolean | Must be true |
| `confirmed_at` | timestamp | Required |
| `snapshot_hash` | string | Must match calculation snapshot |
| `confirmation_hash` | string | Required |
| `created_at` | timestamp | Required |

One calculation has zero or one confirmation.

## 7.6 Dose log

**Table:** `insulin_administrations` or `dose_log`

| Field | Type | Key/constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `patient_id` | UUID | Foreign key |
| `calculation_id` | UUID nullable | Foreign key |
| `administered_units` | decimal/string | Required, `> 0` |
| `administered_at` | timestamp | Required |
| `source` | enum | `MANUAL`; no pump integration |
| `entered_manually` | boolean | Required |
| `notes` | text nullable | Optional; never used in arithmetic |
| `created_at` | timestamp | Required |
| `record_checksum` | string | Required |

The administered amount may differ from the calculated amount. Never overwrite the calculation.

## 7.7 Audit event

**Table:** `audit_events`

| Field | Type | Key/constraint |
|---|---|---|
| `sequence` | bigint | Ordered sequence or per-stream sequence |
| `event_id` | UUID | Primary key |
| `event_type` | enum | Required |
| `patient_id` | UUID | Foreign key |
| `calculation_id` | UUID nullable | Foreign key |
| `occurred_at` | timestamp | Required |
| `payload` | JSON | Immutable |
| `previous_hash` | string nullable | Hash-chain link |
| `event_hash` | string | Required |
| `offline` | boolean | Required |
| `sync_status` | enum | Pending/synced/conflict |
| `created_at` | timestamp | Required |

Events:

```text
CALCULATION_STARTED
CALCULATION_REFUSED
CALCULATION_COMPLETED
CALCULATION_VIEWED
CALCULATION_CONFIRMED
CALCULATION_EXPIRED
CALCULATION_INVALIDATED
ADMINISTRATION_RECORDED
CONFIGURATION_CREATED
CONFIGURATION_APPROVED
CONFIGURATION_ACTIVATED
CONFIGURATION_REVOKED
```

## 7.8 Settings version history

Settings history is represented by immutable rows in `clinician_configurations`.

Relationship:

```text
patient 1 ──< clinician_configurations
active configuration 1 ──< calculation_requests
calculation_request 1 ──1 calculation
calculation 1 ──0..1 confirmation
calculation 1 ──0..n administration records
calculation 1 ──< audit events
```

No historical calculation is rewritten after a new settings version is activated.

---

# 8. API contract

The pure module must be callable locally from a PWA and may be wrapped by HTTP endpoints. All clinical decimals cross boundaries as canonical strings.

## 8.1 `validateSettings`

```ts
function validateSettings(
  settings: ClinicianSettingsRecord,
  at: string
): SettingsValidationResult;
```

Success:

```json
{
  "valid": true,
  "configurationId": "cfg_123",
  "version": 1,
  "checksumVerified": true
}
```

Failure:

```json
{
  "valid": false,
  "refusalCode": "CONFIGURATION_EXPIRED",
  "message": "The clinician settings are not active."
}
```

## 8.2 `calculateMealBolus`

```ts
function calculateMealBolus(
  settings: ValidatedClinicianSettings,
  input: MealCalculationInput
): BolusCoreResult;
```

Request:

```json
{
  "currentGlucose": "10",
  "glucoseUnit": "MMOL_L",
  "carbohydrateGrams": "40"
}
```

Core result before workflow metadata:

```json
{
  "status": "CALCULATED",
  "mealComponentUnits": "4",
  "correctionComponentUnits": "2",
  "activeInsulinAdjustmentUnits": "0",
  "unroundedTotalUnits": "6",
  "roundedTotalUnits": "6"
}
```

This function must only be invoked after active-insulin/history safety gates pass.

## 8.3 `calculateCorrectionBolus`

```ts
function calculateCorrectionBolus(
  settings: ValidatedClinicianSettings,
  input: CorrectionCalculationInput
): BolusCoreResult;
```

Request:

```json
{
  "currentGlucose": "11",
  "glucoseUnit": "MMOL_L",
  "carbohydrateGrams": "0"
}
```

Response:

```json
{
  "status": "CALCULATED",
  "mealComponentUnits": "0",
  "correctionComponentUnits": "2.5",
  "activeInsulinAdjustmentUnits": "0",
  "unroundedTotalUnits": "2.5",
  "roundedTotalUnits": "2.5"
}
```

## 8.4 `runSafetyGates`

```ts
function runSafetyGates(
  settings: ClinicianSettingsRecord,
  request: BolusPreviewRequest,
  context: SafetyContext
): SafetyGateResult;
```

Result:

```json
{
  "allowed": false,
  "refusal": {
    "refusalCode": "ACTIVE_PRIOR_BOLUS",
    "refusalCategory": "ACTIVE_INSULIN",
    "userFacingMessage": "Calculation unavailable because a previous rapid-acting dose may still be active.",
    "blockingReason": "Prior rapid-acting insulin falls within the configured duration.",
    "safeNextStep": "Follow the clinician-approved plan or contact the treating team."
  }
}
```

## 8.5 `calculateBolusPreview`

```ts
async function calculateBolusPreview(
  request: BolusPreviewRequest,
  dependencies: {
    settingsRepository: SettingsRepository;
    auditStore: AuditStore;
    clock: Clock;
    idGenerator: IdGenerator;
  }
): Promise<BolusSuccess | BolusRefusal>;
```

HTTP-style endpoint:

```http
POST /api/v1/calculations
Idempotency-Key: <uuid>
Content-Type: application/json
```

Request:

```json
{
  "patientId": "patient_123",
  "configurationId": "cfg_123",
  "mode": "MEAL",
  "currentGlucose": "10",
  "glucoseUnit": "MMOL_L",
  "glucoseTimestamp": "2026-07-24T03:55:00.000Z",
  "glucoseSource": "CGM",
  "glucoseConfirmed": true,
  "glucoseTrend": null,
  "carbohydrateGrams": "40",
  "carbohydratesConfirmed": true,
  "activeInsulinUnits": null,
  "recentHistoryComplete": true,
  "priorRapidActingDoses": [],
  "hypoSymptoms": false,
  "duplicateDose": false,
  "specialSituations": [],
  "calculatedAt": "2026-07-24T04:00:00.000Z"
}
```

Response is the success or refusal contract in Section 6.

## 8.6 `confirmBolus`

```ts
async function confirmBolus(
  request: ConfirmationRequest,
  repositories: WorkflowRepositories
): Promise<ConfirmationResult>;
```

HTTP:

```http
POST /api/v1/calculations/{calculationId}/confirm
Idempotency-Key: <uuid>
```

Request:

```json
{
  "patientId": "patient_123",
  "confirmed": true,
  "confirmationTextAccepted": true,
  "confirmedAt": "2026-07-24T04:04:00.000Z",
  "expectedSnapshotHash": "sha256:example"
}
```

Success:

```json
{
  "status": "USER_CONFIRMED",
  "calculationId": "calc_01JEXAMPLE",
  "confirmedAt": "2026-07-24T04:04:00.000Z",
  "confirmationHash": "sha256:example-confirmation"
}
```

## 8.7 `logConfirmedBolus`

This function records the actual administered dose after a separate user action. It does not administer insulin and must not assume the calculated dose was used.

```ts
async function logConfirmedBolus(
  request: {
    calculationId: string;
    patientId: string;
    administeredUnits: string;
    administeredAt: string;
  },
  repositories: WorkflowRepositories
): Promise<AdministrationResult>;
```

HTTP:

```http
POST /api/v1/administrations
Idempotency-Key: <uuid>
```

Response:

```json
{
  "status": "ADMINISTRATION_RECORDED",
  "calculationId": "calc_01JEXAMPLE",
  "calculatedUnits": "6",
  "administeredUnits": "5.5",
  "administeredAt": "2026-07-24T04:06:00.000Z"
}
```

## 8.8 `rejectBolusPreview`

Used when the user declines the preview or when the UI detects changed inputs.

```ts
async function rejectBolusPreview(
  request: {
    calculationId: string;
    patientId: string;
    rejectedAt: string;
    reason: "USER_REJECTED" | "INPUT_CHANGED" | "SETTINGS_CHANGED";
  },
  repositories: WorkflowRepositories
): Promise<InvalidationResult>;
```

Response:

```json
{
  "status": "INVALIDATED",
  "calculationId": "calc_01JEXAMPLE",
  "reason": "INPUT_CHANGED",
  "invalidatedAt": "2026-07-24T04:02:00.000Z"
}
```

## 8.9 Relationship to reference implementation

The Stage 5 source exposes:

```ts
calculateBolus(configuration, input)
BolusWorkflowService.createCalculation(...)
BolusWorkflowService.confirm(...)
BolusWorkflowService.invalidate(...)
BolusWorkflowService.recordAdministration(...)
```

The named interfaces above are framework-independent wrappers that preserve those behaviors while adding the open Stage 2/3 production controls. They must not change formulas or add autonomous logic.

---

# 9. Logging and confirmation

## 9.1 Logged before confirmation

Before any result is displayed, persist:

- calculation ID;
- patient ID;
- immutable input snapshot;
- settings ID/version/checksum;
- calculator and safety-policy versions;
- `CALCULATION_STARTED`;
- safety-gate outcome;
- either `CALCULATION_REFUSED` or `CALCULATION_COMPLETED`;
- formula components for success;
- refusal code for refusal;
- preview expiry;
- review snapshot hash;
- online/offline state;
- event hash-chain fields.

If this persistence fails, do not display a dose.

## 9.2 Logged after confirmation

After valid confirmation, persist:

- `CALCULATION_CONFIRMED`;
- confirmation time;
- accepted confirmation statement;
- patient identity;
- expected snapshot hash;
- confirmation hash.

After optional administration recording, persist separately:

- `ADMINISTRATION_RECORDED`;
- actual dose;
- administration time;
- calculated dose for comparison;
- source (`MANUAL`);
- record hash.

## 9.3 Never logged

Do not write clinical data to:

- browser console;
- general application logs;
- analytics events;
- crash-report text fields;
- public storage;
- URL query strings;
- third-party AI prompts.

Never log:

- service-role credentials;
- authentication tokens;
- raw database passwords;
- unrelated free-text health notes into calculation telemetry.

## 9.4 Explicit confirmation requirements

Confirmation requires all of:

```text
confirmed = true
confirmationTextAccepted = true
patient identity matches
state is CALCULATED or CALCULATED_ZERO
current time is not later than expiresAt
snapshot hash matches
no prior confirmation exists
no invalidation exists
```

Required confirmation wording:

> I have checked the glucose, carbohydrates, recent insulin and calculation.

Button:

> Confirm calculation

Do not label the button “Inject”, “Take insulin”, or “Administer now”.

## 9.5 Confirmation expiry

Reference behavior:

```text
expiresAt = createdAt + 5 minutes
```

- exactly at `expiresAt`: accepted by Stage 5 code;
- later than `expiresAt`: mark `EXPIRED` and reject.

Any change requires clinician approval and new tests.

## 9.6 Duplicate-confirmation protection

A calculation transitions once:

```text
CALCULATED/CALCULATED_ZERO → USER_CONFIRMED
```

Any second confirmation returns `DUPLICATE_CONFIRMATION`.

Production persistence must enforce uniqueness transactionally, not only in memory.

## 9.7 Immutable audit fields

At minimum:

```text
eventId
sequence
eventType
patientId
calculationId
occurredAt
payload
previousHash
eventHash
configurationId
configurationVersion
calculatorVersion
safetyPolicyVersion
```

Historical records are never edited. Corrections create new events or superseding records.

---

# 10. Tests

Base configuration for expected examples:

```json
{
  "icr": "10",
  "isf": "2",
  "targetGlucose": "6",
  "insulinDurationHours": "4",
  "doseIncrementUnits": "0.5",
  "maximumDoseUnits": "20",
  "lowGlucoseThreshold": "4",
  "glucoseUnit": "MMOL_L"
}
```

## 10.1 Complete test matrix

| Test | Input summary | Expected result | Evidence status |
|---|---|---|---|
| Standard meal dose | Meal, `G=6`, `C=40` | Meal `4`, correction `0`, raw `4`, rounded `4`, `CALCULATED` | Required fixture; formula covered |
| Correction only | Correction-only, `G=11`, `C=0` | Meal `0`, correction `2.5`, rounded `2.5` | Existing test |
| Meal plus correction | Meal, `G=10`, `C=40` | Meal `4`, correction `2`, raw/rounded `6` | Existing test |
| Below-target meal | Meal, `G=5`, `C=40` | Correction `-0.5`; raw/rounded `3.5` | Existing test |
| Active insulin subtraction | Positive/potentially active insulin | **Refuse `ACTIVE_PRIOR_BOLUS`; no subtraction** | Existing prior-dose test |
| Dose rounding | Raw `4.25`, increment `0.5` | `4.5` using half-up | Existing decimal/calculator tests |
| No component pre-rounding | Meal `4.3`, correction `0.2` | Raw `4.5`, rounded `4.5` | Existing test |
| Maximum raw dose | Raw above `20` | Refuse `MAXIMUM_DOSE_EXCEEDED`; no dose fields | Existing test |
| Maximum after rounding | Raw within maximum but rounded above it | Refuse `MAXIMUM_DOSE_EXCEEDED` | Existing test |
| Low glucose | `G=4` | Refuse `HYPO_THRESHOLD` | Existing test |
| Immediately above low | `G=4.000001` | Not refused by threshold gate | Existing test |
| Stale glucose | Age `> 15 minutes` | Refuse `STALE_GLUCOSE` | **Required gap** |
| Future glucose | Measurement after calculation time | Refuse `FUTURE_GLUCOSE_TIMESTAMP` | **Required gap** |
| Missing settings | No active config or missing required field | Refuse `NO_ACTIVE_CONFIGURATION` or `INVALID_CONFIGURATION` | Numeric invalid config tested; lifecycle gap |
| Invalid units | `MG_DL` input with `MMOL_L` settings | Refuse `UNIT_MISMATCH` | Existing test |
| Unavailable insulin history | `recentHistoryComplete=false` | Refuse `RECENT_BOLUS_HISTORY_INCOMPLETE` | Existing test |
| Active prior dose | 3 U at 2:59:59 elapsed with 4 h duration | Refuse `ACTIVE_PRIOR_BOLUS` | Existing test |
| Exact duration boundary | 3 U exactly 4 h earlier | Calculation permitted | Existing test |
| Future prior dose | Dose timestamp after calculation | Refuse `FUTURE_PRIOR_BOLUS` | Existing test |
| Zero carbohydrate meal | `MEAL`, `C=0` | Refuse `INVALID_INPUT` | Existing test |
| Zero carbohydrate correction | `CORRECTION_ONLY`, `C=0` | Valid | Existing test |
| Nonzero carbohydrate correction mode | `CORRECTION_ONLY`, `C=1` | Refuse `INVALID_INPUT` | Existing test |
| Negative carbohydrate | `C<0` | Refuse `INVALID_INPUT` | Parser behavior; add explicit named test |
| Negative active insulin | `activeInsulinUnits<0` | Refuse `INVALID_INPUT` | Required wrapper test |
| High glucose | High but valid glucose, dose within max | Deterministic correction result | Add clinician golden case |
| High glucose exceeding max | Result over max | Refuse `MAXIMUM_DOSE_EXCEEDED` | Existing maximum tests |
| Active insulin above total | Positive active insulin greater than otherwise calculated total | Refuse `ACTIVE_PRIOR_BOLUS`; do not return zero | Required explicit test, behavior defined |
| Hypo symptoms | `hypoSymptoms=true` | Refuse `HYPO_SYMPTOMS` | Existing test |
| Severe illness | Special situation | Refuse `SPECIAL_CLINICAL_SITUATION` | Generic existing test |
| Vomiting | Special situation | Refuse `SPECIAL_CLINICAL_SITUATION` | Add explicit enum test |
| Ketones | Special situation | Refuse `SPECIAL_CLINICAL_SITUATION` | Add explicit enum test |
| Paediatric/pregnancy | Special situation | Refuse `SPECIAL_CLINICAL_SITUATION` | Add explicit enum tests |
| Concentrated insulin ambiguity | Special situation | Refuse `SPECIAL_CLINICAL_SITUATION` | Add explicit enum test |
| Repeated confirmation | Confirm same calculation twice | Second returns `DUPLICATE_CONFIRMATION` | Existing test |
| Expiry | Confirm after five minutes | `CALCULATION_EXPIRED` | Existing test |
| Exact expiry boundary | Confirm exactly at five minutes | Accepted under current code | Add explicit boundary test |
| Snapshot changed | Wrong snapshot hash | `SNAPSHOT_MISMATCH` | Existing test |
| Input invalidated | Invalidate then confirm | `CALCULATION_INVALIDATED` | Existing test |
| Patient mismatch | Different patient confirms | `PATIENT_MISMATCH` | Existing test |
| Administration differs | Calculated `6`, recorded `5.5` | Preserve both; state `ADMINISTRATION_RECORDED` | Existing test |
| Repeated administration | Second administration attempt | Reject according to final workflow policy | Required gap |
| Logging failure | Audit append throws before result display | No result displayed; `AUDIT_PERSISTENCE_FAILURE` | Required explicit fault-injection test |
| Audit tampering | Modify/delete/reorder event | `verifyChain()` false | Required explicit tests |
| Deterministic repeatability | Same input/config repeated 100 times | Deep-equal result every time | Existing test |
| Property sweep | Broad glucose/carbohydrate set | Nonnegative increment multiple, never above max | Existing test |
| Exact decimals | `0.1 + 0.2` style cases | Exact canonical decimal | Existing decimal test |
| Invalid decimal formats | exponent/locale strings | Refuse | Existing tests |
| mmol/L and mg/dL | Equivalent independently configured cases | Correct per-unit arithmetic; no silent conversion | mg/dL golden dataset required |

## 10.2 Existing evidence

Stage 5 evidence:

```text
Automated tests: 36
Passed: 36
Failed: 0
TypeScript check: passed
```

Existing tests cover formula, boundary, property and workflow behavior but do not establish clinical validity.

---

# 11. Implementation structure

The module must remain framework-independent and callable from a browser/PWA or server wrapper.

Recommended production layout:

```text
src/bolus/
  types.ts
  settings.ts
  decimal.ts
  calculations.ts
  safety.ts
  confirmation.ts
  logging.ts
  repositories.ts
  errors.ts
  index.ts

tests/bolus/
  settings.test.ts
  decimal.test.ts
  calculations.test.ts
  safety.test.ts
  confirmation.test.ts
  logging.test.ts
  fixtures/
    clinician-golden-cases.json

docs/bolus/
  BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md
  clinician-review-checklist.md
  audit-checklist.md
  traceability-matrix.csv
  preliminary-risk-register.csv
```

Dependency direction:

```text
types/decimal
      ↓
calculations  ← pure, deterministic, no network/storage/UI
      ↓
safety/settings
      ↓
confirmation/logging/repositories
      ↓
PWA or HTTP adapter
```

The pure calculator must not depend on:

- React or another UI framework;
- Supabase;
- Railway;
- service workers;
- food databases;
- speech recognition;
- AI services;
- browser storage;
- network access.

The ZIP contains the exact Stage 5 reference implementation under `reference-implementation/`. It may be reorganised mechanically, but formulas and safety behavior must not be redesigned.

Local reference commands:

```bash
cd reference-implementation
npm test
npm run check
```

Node requirement in the reference package: Node `>=22`.

---

# 12. Clinician-review checklist

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
- [ ] Dose increment matches the user’s delivery device.
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
Decision: [ ] Not approved [ ] Validation only [ ] Release subject to conditions

---

# 13. Audit requirements

## 13.1 Versioning

Every calculation must record:

- settings ID and version;
- settings schema version;
- calculator version;
- safety-policy version;
- API/schema version;
- application release/build version.

Historical calculations remain tied to their original versions.

## 13.2 Source hashes

The handoff includes Stage 5 source SHA-256 evidence. The local reconstruction must regenerate hashes after any change.

Required hash inventory:

- every source file;
- every test file;
- dependency lockfile;
- built artefact;
- final handoff/release archive;
- approved settings configuration;
- clinician golden dataset.

## 13.3 Deterministic test evidence

Minimum evidence:

- test command and environment;
- full test output;
- type-check output;
- exact source commit/hash;
- fixture hashes;
- result count: pass/fail/skipped;
- property-test ranges;
- clinician golden-case results.

Reference evidence: 36 passed, 0 failed.

## 13.4 Safety-gate coverage

Maintain a traceability row for every safety gate:

```text
Requirement ID
Hazard/control ID
Implementation file/function
Unit test
Integration test
UI/e2e test
Clinical review status
Release status
```

No gate is complete without objective evidence.

## 13.5 Settings provenance

Audit must establish:

- who supplied the settings;
- for DIA, whether the patient transcribed it from a clinician consultation or report;
- the source date/reference and patient accuracy-confirmation timestamp;
- who approved settings where a direct approval workflow exists;
- which patient they belong to;
- when they became effective;
- whether they expired, were revoked or superseded;
- integrity checksum/signature;
- which settings version was used for each calculation.

## 13.6 Calculation trace

For every attempt retain:

- input snapshot;
- unit and timestamp provenance;
- recent insulin snapshot;
- safety declarations;
- gate outcomes;
- component arithmetic;
- unrounded and rounded results;
- maximum comparison;
- refusal code if applicable;
- result checksum;
- software versions.

## 13.7 Confirmation trace

Retain:

- preview state;
- expiration time;
- snapshot hash;
- user identity;
- explicit confirmation booleans;
- confirmation timestamp;
- confirmation hash;
- duplicate-confirmation rejection events;
- invalidation reason;
- separate administration record.

## 13.8 Audit package contents

A release/validation audit package must contain:

```text
README.md
implementation handoff
intended-use statement
source code
tests and fixtures
test output
type-check output
source/build hashes
requirements traceability matrix
preliminary/formal risk register
clinician review checklist
clinical golden dataset and results
API/schema documentation
security/RLS evidence
usability evidence
known limitations
release-gate checklist
regulatory assessment
signed release decision
```

## 13.9 Stage 6 open release blockers

- glucose freshness and device-clock controls;
- active/approved configuration lifecycle and integrity;
- durable transactional persistence;
- production API/authentication/RLS;
- explicit audit tamper/concurrency tests;
- independent clinician golden dataset;
- UI and human-factors validation;
- formal risk-management file;
- security review;
- regulatory pathway;
- reproducible signed release artefact.

---

# 14. Integration boundary

The integration boundary is mandatory:

- **The food database supplies carbohydrate grams and provenance only.**
- **The bolus module does not know about food names, AUSNUT, AFCD, search, or serving lookup.**
- **The bolus module receives numeric carbohydrate grams as a canonical decimal string.**
- **No conversational AI may perform or alter the arithmetic.**
- **The UI may only display and confirm deterministic calculator output.**

Additional controls:

1. Food interpretation produces an untrusted candidate total.
2. The user reviews food items and confirms a numeric carbohydrate total.
3. Only the confirmed numeric value crosses into the bolus request.
4. The calculation module never receives food descriptions, search results, database ranking or AI reasoning.
5. Changing the carbohydrate total after preview invalidates the preview.
6. Food provenance may be stored for audit but cannot affect the dose formula.
7. No food estimate automatically confirms a calculation.

Boundary types:

```ts
interface FoodModuleCandidate {
  mealId: string;
  candidateCarbohydrateGrams: string;
  provenance: readonly {
    source: "DATABASE" | "USER_ENTERED" | "AI_ESTIMATE";
    sourceReference?: string;
  }[];
}

interface ConfirmedCarbohydrateInput {
  mealId: string;
  confirmedCarbohydrateGrams: string;
  confirmedByUser: true;
  confirmedAt: string;
}
```

Only `ConfirmedCarbohydrateInput.confirmedCarbohydrateGrams` enters the bolus module.

---

# 15. Claude Code reconstruction prompt

## Claude Code Build Prompt

Implement the clinician-supplied bolus module exactly from `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`.

Requirements:

- Use the included Stage 5 reference source as the baseline.
- Keep the module framework-independent and callable from a PWA.
- Implement exact deterministic decimal arithmetic and the defined tests.
- Preserve every safety gate and fail closed.
- Preserve the hard prior-bolus lockout; do not implement active-insulin subtraction or an insulin-on-board curve.
- Implement the identified missing production controls: glucose timestamp/freshness, clock checks, settings lifecycle/integrity, patient-entered DIA provenance from clinician consultation/report, closed special-situation enums, durable repository interfaces, and fault-injection tests.
- Create no autonomous clinical logic.
- Create no AI-generated dosing logic.
- Create no treatment-plan generation.
- Create no machine-learning dose adjustment.
- Do not derive ICR, ISF, target, duration, increment, maximum, low threshold or units.
- Allow the patient to enter DIA only as a transcription of current clinician consultation advice or a clinician-provided report; require provenance, explicit accuracy confirmation and versioning.
- Do not alter formulas or clinical boundaries without stopping and reporting the conflict.
- Ensure refusals expose no dose.
- Keep calculation confirmation separate from administration logging.
- Run unit, property, integration and audit-integrity tests.
- Produce updated source hashes, test output, traceability matrix, risk/control status, clinician checklist and audit package.
- Stop before deployment. Do not configure production hosting, connect an insulin-delivery device, or represent the software as clinically approved.

Report:
1. files created or changed;
2. all test results;
3. unresolved conflicts;
4. release blockers;
5. path to the generated audit package.
