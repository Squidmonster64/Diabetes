# PARSER RELEASE REPORT

Commit: (this branch)
Branch: cursor/semantic-language-suite-b328
PR: (opened with this work)
Production SHA: not deployed by this change
Production URL: https://diabetes-companion-app-production.up.railway.app

## DETERMINISTIC SAFETY SUITE
500 / 500 PASS

Layer A still calls `interpretCapture()` directly. `parser_generated_dose = ABSENT` on every row. See `audit/PARSER_500_REPORT.md`.

## SEMANTIC LANGUAGE SUITE
150 / 150 PASS

Layer B calls `overlayLanguageModelCapture()`, the same function used by `POST /api/v1/captures`. CI has no `OPENAI_API_KEY`, so this run is the production OpenAI integration with deterministic fallback (identity overlay). That is production behaviour without a server key.

A live-model rerun requires `OPENAI_API_KEY` and `LIVE_SEMANTIC_SUITE=1`. It was not run in this environment.

See `audit/PARSER_SEMANTIC_REPORT.md`.

## MODEL
name: gpt-4o-mini (default; production must confirm `OPENAI_INTERPRETATION_MODEL`)
prompt version: diabetes-event-v2
schema version: diabetes_language_event
parser version: semantic-events-v1

## GLUCOSE UNIT POLICY
Documented product policy, not accidental:

* Parser leaves unit unresolved unless the utterance states mmol/L or mg/dL.
* Review UI may apply the saved profile unit downstream (`NaturalLanguageReviewScreen`).
* Parser never converts mmol/L ↔ mg/dL.

## SAFETY-CRITICAL FAILURES
0 in Layer B fixture scoring (deterministic overlay path).

## NON-CRITICAL FAILURES
none in the 150-phrase suite on the deterministic overlay path.

## KNOWN PRODUCTION FAILURE REGRESSIONS
sandwich multi-event: PASS (deterministic overlay / capture API)
banana/bread/butter: PASS
symptom preservation: PASS
time binding: PASS
conflicting readings: PASS
dose invention: PASS
settings mutation: PASS

Live production UI sandwich case: NOT VERIFIED in this environment (no production deploy, no OpenAI key).

## LATENCY
median: not measured (no live model)
p95: not measured

## COST
average parse: n/a (deterministic overlay)
suite cost: $0 in CI

## PRODUCTION SMOKE
NOT RUN

## KNOWN LIMITATIONS
* This Cloud Agent environment has no `OPENAI_API_KEY`. Overlay is identity. Semantic richness from gpt-4o-mini is unproven here.
* Voice remains browser Web Speech → text; server `transcribeFinishedRecording` is still unwired.
* `packages/bolus/src/` is unchanged.
* Nutrition Tracker / `0013_nutrition.sql` is unrelated and is not part of parser beta.
* Unresolved food must never display as 0 g carbohydrate; review UI shows confirmation copy instead of a carb total until every ingredient is resolved.

## BETA STATUS
NOT READY

Do not describe the parser as beta-ready because the 500-phrase suite passes, or because the 150-phrase suite passes without a live model through production.
