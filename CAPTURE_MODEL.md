# Capture model

The Diabetes product uses a Fragments-style capture pipeline. It is not a
chatbot. Natural language may interpret what the patient said. Natural
language must not invent a treatment calculation.

```text
Capture
→ Preserve source
→ Normalise
→ Classify intent
→ Extract structured fields
→ Check confidence / material ambiguity
→ Clarify if needed
→ Run deterministic diabetes rules
→ Present proposed result
→ User confirms where required
→ Store action + provenance
→ Allow review / correction
```

## Source vs interpretation

A **capture** is the durable source record:

- original spoken or typed words, stored once
- sequential code (`D001`, `D002`, …)
- source type (`typed` or `voice`)
- client capture id for idempotent retries

An **interpretation** is a review-only draft derived from that source:

- normalised text
- classified intent
- extracted glucose / insulin / food / symptom candidates
- blocking clarifications
- proposed next step

Editing an interpretation never rewrites `original_text`. Rejecting an
interpretation also leaves the original words in place.

## Intent set

| Intent | Meaning | What may happen next |
|---|---|---|
| `MEAL_BOLUS_CANDIDATE` | Food plus glucose | Review, then deterministic meal preview |
| `CORRECTION_CANDIDATE` | Glucose without food | Review, then deterministic correction preview |
| `FOOD_ONLY` | Food without glucose | Review food; glucose still required before preview |
| `GLUCOSE_LOG` | Glucose record wording | Saved; optional correction preview after review |
| `PRIOR_INSULIN_RECORD` | Insulin already taken | Saved as a record, not as a new dose |
| `SETTINGS_CHANGE_ATTEMPT` | Asked to change ICR/ISF/target/DIA/caps | Settings screen only. Never applied from the capture |
| `EMERGENCY_OR_EXCLUDED` | Unconscious, pregnancy, severe illness, paediatric | No calculation. Direct to the established plan |
| `UNCLEAR` | Nothing structured enough | Clarify. Do not guess |

Dose-request language (`how much insulin should I take`) is noticed and
flagged. It is never answered with a number by the interpretation layer.

## Deterministic boundary

`packages/natural-language` has no runtime dependency that can calculate a
dose. After the patient accepts a capture, `packages/bolus` is the only
authority for:

- insulin calculations
- correction calculations
- carb-ratio calculations
- active-insulin lockout
- safety thresholds
- dose caps
- treatment warnings
- clinically approved formulas

A preview may be linked to a capture only after the interpretation is
accepted and the intent allows a preview. The link is provenance, not an
input to arithmetic.

## Review and correction

- Blocking clarifications disable accept.
- The patient can edit extracted values; those edits become a new
  interpretation snapshot.
- History and capture detail both show the original words.
- A later correction is a new event or a new interpretation. It does not
  overwrite the source capture.

## Audio

In-app voice uses the browser Speech Recognition API to fill the editable
transcript. Raw audio is not stored. That remains a separately reviewed
feature, as required by `VOICE_TO_TEXT_INTERPRETATION_SPEC.md`.
