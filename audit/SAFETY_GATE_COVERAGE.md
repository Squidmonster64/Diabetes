# Safety-gate coverage

Traceability matrix for every gate in
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` sections 5.1-5.3. "Clinical
review status" is **Not reviewed** for every row - see
[`CLINICIAN_REVIEW_CHECKLIST.md`](CLINICIAN_REVIEW_CHECKLIST.md). "Release
status" reflects engineering completeness only, not clinical approval.

| # | Gate | Implementation | Unit test | Integration/e2e test | Clinical review | Release status |
|---:|---|---|---|---|---|---|
| 1 | Application integrity | `safety.ts: applicationIntegritySelfCheckPasses` | `calculations.test.ts` (indirect, every test) | - | Not reviewed | Implemented |
| 2 | Authentication/patient binding | `safety.ts: runSafetyGates` (`UNAUTHENTICATED`/`PATIENT_MISMATCH`) | `safety.test.ts` | `auth-isolation.test.ts` | Not reviewed | Implemented |
| 3 | Missing active settings | `settings.ts: validateSettings` | `settings.test.ts` | `refusal-paths.test.ts`, e2e #4 | Not reviewed | Implemented |
| 4 | Settings lifecycle/integrity | `settings.ts: validateSettings` (status/expiry/checksum/schema) | `settings.test.ts` | - | Not reviewed | Implemented |
| 5 | Missing/invalid settings incl. DIA provenance | `settings.ts: validateSettings` | `settings.test.ts` | `confirmation-and-versioning.test.ts` | Not reviewed | Implemented |
| 6 | Input schema | `safety.ts: runSafetyGates` | `safety.test.ts` | - | Not reviewed | Implemented |
| 7 | Invalid glucose units | `safety.ts` (`UNIT_MISMATCH`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 8 | Unconfirmed glucose | `safety.ts` (`UNCONFIRMED_GLUCOSE`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 9 | Unconfirmed carbohydrates | `safety.ts` (`UNCONFIRMED_CARBOHYDRATES`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 10 | Missing/ambiguous current glucose | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 11 | Future glucose | `safety.ts` (`FUTURE_GLUCOSE_TIMESTAMP`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 12 | Stale glucose (15 min) | `safety.ts` (`STALE_GLUCOSE`) | `safety.test.ts` (incl. exact boundary) | `refusal-paths.test.ts`, e2e #3 | Not reviewed | Implemented |
| 13 | Unreliable clock | `safety.ts` (`UNRELIABLE_DEVICE_TIME`, server-clock skew check) | `safety.test.ts` | - | Not reviewed | Implemented |
| 14 | Invalid carbohydrate amount | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 15 | Duplicate-event risk | `safety.ts` (`DUPLICATE_EVENT_RISK`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 16 | Recent history unavailable | `safety.ts` (`RECENT_BOLUS_HISTORY_INCOMPLETE`) | `safety.test.ts` | `refusal-paths.test.ts` | Not reviewed | Implemented |
| 17 | Invalid active insulin | `safety.ts` (`INVALID_INPUT`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 18 | Invalid prior-dose record | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 19 | Future prior dose | `safety.ts` (`FUTURE_PRIOR_BOLUS`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 20 | Potentially active prior insulin | `safety.ts` (`ACTIVE_PRIOR_BOLUS`, incl. exact-boundary test) | `safety.test.ts` | `refusal-paths.test.ts`, e2e #5 | Not reviewed | Implemented |
| 21 | Severe hypo/unconsciousness (emergency) | `safety.ts` (`UNCONSCIOUS_OR_UNABLE_TO_SWALLOW → HYPO_SYMPTOMS`) | `safety.test.ts` | - | Not reviewed | Implemented (UI declaration - see limitation below) |
| 22 | Hypo symptoms | `safety.ts` (`HYPO_SYMPTOMS`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 23 | Low glucose | `safety.ts` (`HYPO_THRESHOLD`, incl. immediate-above boundary) | `safety.test.ts` | `refusal-paths.test.ts`, e2e #2 | Not reviewed | Implemented |
| 24 | Severe illness | `safety.ts` (`SPECIAL_CLINICAL_SITUATION`) | `safety.test.ts` | - | Not reviewed | Implemented |
| 25 | Vomiting/dehydration | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 26 | Ketones | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 27 | Paediatric use | `safety.ts` (`context.patientIsAdult` + enum) | `safety.test.ts` | - | Not reviewed | Scope exclusion; identity enforcement is API-supplied context, not yet wired to a real identity-of-record |
| 28 | Pregnancy use | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 29 | Concentrated insulin ambiguity | `safety.ts` (`concentratedInsulinConfirmed` explicit UI gate) | `safety.test.ts` | - | Not reviewed | Implemented |
| 30 | Other excluded clinical context | `safety.ts` | `safety.test.ts` | - | Not reviewed | Implemented |
| 31 | Arithmetic failure | `calculations.ts` (try/catch → `ARITHMETIC_FAILURE`) | `calculations.test.ts` | - | Not reviewed | Implemented |
| 32 | Raw maximum | `calculations.ts` (`MAXIMUM_DOSE_EXCEEDED`, never caps) | `calculations.test.ts` | - | Not reviewed | Implemented |
| 33 | Rounded maximum | `calculations.ts` | `calculations.test.ts` | - | Not reviewed | Implemented |
| 34 | Audit persistence | `calculations.ts` (`AuditPersistenceError` → no result shown) | `calculations.test.ts` (fault injection via `InMemoryAuditStore.failNextAppend`) | `logging-failure.test.ts` | Not reviewed | Implemented |
| 35 | Snapshot creation/integrity | `calculations.ts` (`sha256` snapshot hash) | `calculations.test.ts` | `confirmation-and-versioning.test.ts` | Not reviewed | Implemented |
| 36 | Patient mismatch (confirmation) | `confirmation.ts: confirmBolus` | `confirmation.test.ts` | `auth-isolation.test.ts` | Not reviewed | Implemented |
| 37 | Not confirmable | `confirmation.ts` | `confirmation.test.ts` | - | Not reviewed | Implemented |
| 38 | Expired preview | `confirmation.ts` (exact 5-min boundary accepted, later refused) | `confirmation.test.ts` | - | Not reviewed | Implemented per conflict C-07; boundary pending clinician approval |
| 39 | Changed snapshot | `confirmation.ts` (`SNAPSHOT_MISMATCH`) | `confirmation.test.ts` | - | Not reviewed | Implemented |
| 40 | Duplicate confirmation | `confirmation.ts` (`DUPLICATE_CONFIRMATION`) | `confirmation.test.ts` | `confirmation-and-versioning.test.ts`, e2e #7 | Not reviewed | Implemented |
| 41 | Explicit text not accepted | `confirmation.ts` (`confirmed`/`confirmationTextAccepted` both required) | `confirmation.test.ts` | - | Not reviewed | Implemented |
| 42 | Administration validation | `confirmation.ts: logConfirmedBolus` | `confirmation.test.ts` | - | Not reviewed | Implemented |

## Known engineering-level gaps

- **Gate 27 (paediatric)**: `patientIsAdult` is currently supplied by the API
  caller (an `X-Patient-Is-Adult` header in dev mode), not backed by a
  verified identity-of-record field. A production deployment must source
  this from a verified patient profile field, not a client-supplied header.
- **Gate 21 (emergency escalation)**: the UI declares this as a checkbox
  (`UNCONSCIOUS_OR_UNABLE_TO_SWALLOW` in `GlucoseEntryScreen.tsx`'s special
  situations list) rather than a dedicated, more prominent emergency
  declaration flow. Human-factors review is required before real-world use.

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for the complete list.
