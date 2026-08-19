# Reusable Safe Voice-to-Text Interpretation Specification

**Purpose.** This specification defines a robust, auditable voice-to-text experience for clinical, financial, legal, or other high-consequence applications. It is designed for users who should be able to speak naturally, use informal wording, make ordinary transcription errors, and still see every interpreted value before any consequential action occurs.

> **Non-negotiable rule:** Speech recognition may create an editable draft only. It must never directly calculate, prescribe, submit, transmit, or confirm a consequential value.

## 1. Required interaction model

The application must provide an **in-app** voice control. Do not rely on the user finding a keyboard microphone or enabling device dictation.

| State | Required visual treatment | Required label | Behaviour |
|---|---|---|---|
| Idle | Full-width **red** button with high contrast | **Push to talk** | Starts browser speech recognition and requests microphone permission if necessary. |
| Listening | Full-width **black** button with a clear contrasting border | **Push to finish** | Continues transcription until the user deliberately activates the button again. |
| Finishing | Same black control or a visibly disabled finishing state | **Finishing voice entry…** | Stops recognition while retaining the final transcript returned by the browser. |
| Unsupported or failed | Normal typed-entry field remains available | Typed-entry fallback | Explains the problem in plain language and never blocks manual entry. |

The button must expose its active state programmatically using `aria-pressed`, associate instructions using `aria-describedby`, and publish microphone/transcription status in an `aria-live="polite"` region. The typed text field must remain visible, editable, and usable at every point.

## 2. Browser speech-recognition adapter

Implement the browser integration behind a small adapter rather than scattering browser-specific checks across screens.

```ts
const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
```

Use the standard constructor when available and the prefixed WebKit constructor as a compatibility fallback. Configure `continuous = true`, `interimResults = true`, `maxAlternatives = 1`, and the user agent language when available. Show interim text in the editable field and retain only final segments after recognition ends. Stop the recognizer when the user selects **Push to finish** and abort it when the component unmounts.

The Web Speech API is not supported in every common browser, and some implementations use server-based recognition by default; the interface must disclose that the browser controls microphone permission and must preserve typed entry as the reliable fallback.[1] [2]

| Recognition condition | Required recovery message |
|---|---|
| Permission denied | Explain that microphone permission was not granted and direct the user to browser settings. |
| No microphone | Explain that no microphone is available and retain typed entry. |
| Network failure | Explain that transcription could not connect and retain typed entry. |
| No speech detected | Invite the user to try again or type the description. |
| Unsupported browser | State that in-app voice entry is unavailable in this browser; do not hide the text field. |
| Any unknown engine error | State that voice entry could not complete and provide retry plus typed-entry fallback. |

Do not persist raw audio unless the product has an explicit, separately reviewed recording-retention feature. The default implementation should retain only the editable transcript needed for the current draft.

## 3. Safety pipeline and review gate

Every transcript must flow through the following sequence. No stage may be skipped.

```text
Voice / typed text
  → editable transcript draft
  → deterministic normalisation
  → provisional extraction with source spans and confidence
  → explicit ambiguity questions
  → user edits and confirms every relevant value
  → validated domain calculation or action
```

The **review screen is mandatory**. It must show the original text, extracted candidates, unresolved ambiguities, and all manual edits. It must disable the consequential next action until every blocking question has been resolved. Low-confidence values must be editable on that screen; they must not be silently accepted merely because a parser found them.

| Extraction status | Meaning | Required product behaviour |
|---|---|---|
| `provisional` | A clearly stated candidate was found. | Display it for user confirmation. |
| `requires_review` | A phrase was recognised but is vague, approximate, weakly contextual, or internally conflicting. | Show an explicit review prompt and block downstream action if the value is material. |
| `missing` | The required value was not stated. | Ask for it with a focused manual control and block downstream action. |
| `confirmed` | Set only after direct user confirmation in the review UI. | May be passed to a later validated workflow. Never set by the parser. |

## 4. Interpretation policy

### 4.1 Preserve source text and normalize only bounded surface forms

Keep the verbatim input unchanged for audit and display. Create a separate normalised representation for extraction. Normalisation may safely perform the following transformations:

| Category | Examples |
|---|---|
| Case and spacing | Lowercase, collapse repeated whitespace, normalise curly apostrophes. |
| Spoken decimals | `eight point four` → `8.4`; `5,4` → `5.4` where the product’s locale policy permits. |
| Attached units | `200ml` → `200 ml`; `180mg/dl` → `180 mg/dl`. |
| Unit aliases | `mils`, `millilitres`, `mls` → `ml`; full spoken glucose units → canonical forms. |
| Bounded cue-word variants | Correct only a reviewed, context-specific set such as `glucos` → `glucose`, `suger` → `sugar`, `insuline` → `insulin`. |
| Constrained voice homophones | Convert only when directly before a recognised unit, for example `for units` → `four units`. |

Do **not** apply unconstrained spell correction to clinical values, numbers, medication names, names of people, or free-form food names. Do not infer a missing unit from a numerical range. Never change a phrase merely because it appears more plausible.

### 4.2 Recognize meaning through contextual patterns, not a fixed phrase list

The system should interpret equivalent natural wording through broad, deterministic contextual patterns. Examples include:

| Intent | Examples that should be recognised | Safe outcome |
|---|---|---|
| A measurement reading | `sugar is 8.4`, `my BGL is 180 mg/dL`, `my level is 5.4`, `I’m at 5.4 mmol/L`, `my reading is…` | Extract the stated number; require unit if absent; flag low-context forms for review. |
| Prior medication / action | `I injected 4 units`, `I dosed 4 units`, `I gave myself 4 units`, `I bolused 4 units` | Extract the stated amount only. Require a precise timing value before a material calculation. |
| Exact informal counts | `a couple`, `a pair`, `both`, `a dozen` | Convert to explicit counts of `2`, `2`, `2`, and `12`, respectively; keep provisional until confirmation. |
| Vague portions | `a few`, `some`, `a handful`, `a splash`, `a bowl` | Do not invent a number. Prompt for a precise amount if material. |
| Serving language | `a serving of rice`, `a portion of cereal` | Treat as a serving intent, not as grams. Present real database-defined measures for user choice. |
| Exact relative time | `half an hour ago`, `two hours ago`, `at 3 pm` | Resolve deterministically against the supplied reference time and show it for confirmation. |
| Approximate or event-relative time | `about 30 minutes ago`, `this morning`, `before lunch`, `earlier today` | Do not manufacture an exact time. Where a calculated candidate is shown, mark it `requires_review`; otherwise ask for an exact time. |
| Food and drink verbs | `eating`, `having`, `just had`, `ate`, `consumed`, `drinking`, `drank`, `finished` | Identify a meal candidate without assuming an unstated portion. |

A bare number must **not** become a clinical reading merely because it appears in a sentence. It needs either a relevant contextual cue or an explicit unit. A phrase such as `I had 8 biscuits` must remain a food count, not a measurement.

## 5. Domain-data resolution

When speech names a **serving**, choose neither a generic portion nor a default database measure. Resolve the food candidate first, then fetch measures available for that exact item.

1. Show the matching food candidate and its provenance.
2. List usable measures, excluding technical coefficients such as density rows.
3. Require the user to choose a measure.
4. Compute the amount only from that selected measure.
5. If no usable measure exists, offer a manual grams or volume field.

The same policy applies to ambiguous food matches: surface candidates and require explicit selection rather than auto-calculating from a weak match.

## 6. Editing and corrections

Every extracted value must have an explicit manual edit path. A user must be able to correct the transcript, an extracted number, a unit, a time, an item identity, a serving measure, or a quantity before continuing.

Support clear self-correction wording such as `I meant three, not two`, but only apply it when both the old and replacement values are explicitly stated and the affected field can be identified. Record the original value, replacement value, target field, and correction phrase in the event draft. If the target is uncertain, ask instead of choosing.

## 7. Required test library

Write deterministic tests for the adapter, normalizer, parser, review logic, and domain-resolution boundary. At minimum cover the following categories.

| Test category | Required assertions |
|---|---|
| Browser capability | Standard and prefixed recognition are accepted; unsupported environments show typed fallback. |
| Button state | Idle control is red and says **Push to talk**; active control is black and says **Push to finish**; stop/end returns to idle. |
| Transcript handling | Interim text is editable; final text is retained; components cleanly stop recognition on unmount. |
| Permission/errors | Permission denied, no microphone, network failure, no speech, and unknown errors present actionable recovery without blocking typing. |
| Measurement synonyms | Sugar/BGL/level/reading patterns parse the explicit candidate and do not infer units. |
| Spoken numbers | Spoken decimals, 21–100 number words, fractions, attached units, and constrained unit-adjacent homophones work. |
| Informal quantities | Couple/pair/both/dozen are exact; few/handful/splash remain unresolved. |
| Time language | Exact phrases resolve; approximate/event-relative phrases require precise review. |
| Servings | A serving exposes selectable database measures and cannot calculate before user selection. |
| Safety | Bare numbers are not misclassified; missing values block; no transcript can bypass the review gate; no parser code performs consequential arithmetic. |

## 8. Copy-ready implementation brief

Copy the block below into another app-development task.

```markdown
Implement a safe in-app voice-to-text entry experience for this application.

The entry screen must include a full-width red button labelled **“Push to talk”**. Activating it must start browser speech recognition and request microphone permission if needed. While the recognizer is active, the same control must turn black with a clear contrasting border and read **“Push to finish”**. Activating it again must stop recognition and retain the final transcript. Do not rely on the Apple or Android keyboard microphone.

Use the standard `SpeechRecognition` API with `webkitSpeechRecognition` as a fallback. Support interim transcripts, set the user-agent language where available, cleanly stop/abort recognition on screen exit, and retain a fully editable text field at all times. Show accessible live status. Provide plain-language fallback messages for unavailable browser support, microphone permission denial, absent audio capture, network failure, no speech, and unknown engine errors. Do not persist raw audio by default.

Treat every transcript as an untrusted, editable draft. Preserve the original text and create a separate normalised form for deterministic extraction. Support natural/spoken wording, bounded cue-word typo recovery, spoken decimals, attached units, unit aliases, exact informal counts (couple/pair/both/dozen), vague quantities, serving language, varied action verbs, and exact versus approximate time phrases. Never use unconstrained fuzzy correction for clinical values or names. Never infer an omitted unit, time, quantity, product, or value from plausibility.

Every material extracted value must carry source text, normalized value, deterministic confidence, status (`provisional`, `requires_review`, `missing`, or `confirmed`), and a user-confirmation requirement. A mandatory review screen must display the original transcript, candidates, ambiguity questions, and editable manual controls. It must block all downstream calculation/submission/action until every required ambiguity is resolved and explicitly confirmed. No parser or voice component may perform consequential arithmetic or automatically submit an action.

For “a serving of [item]”, resolve the item to the applicable database record, list actual usable database measures, and require explicit user selection. Never choose a default serving or silently convert it to grams. When no usable measure is available, provide a manual portion field.

Add regression tests for button states, recognizer support/failure recovery, transcript handling, informal and dictated language, typo boundaries, missing-value blocks, serving selection, and proof that the review gate remains mandatory.
```

## References

[1] [MDN Web Docs, “SpeechRecognition”](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

[2] [MDN Web Docs, “Using the Web Speech API”](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
