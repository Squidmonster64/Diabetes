# PARSER RELEASE REPORT

Commit: (this branch)
Branch: cursor/semantic-language-suite-b328
PR: https://github.com/Squidmonster64/Diabetes/pull/8
Production SHA: not deployed by this change
Production URL: https://diabetes-companion-app-production.up.railway.app

## SCOPE
PR #8 is rebased onto `origin/main` with meal-parser P0, shared AI interpretation, the 500-phrase suite, and the semantic suite.

Nutrition Tracker / `apps/nutrition` / `packages/food-engine` / `supabase/migrations/0013_nutrition.sql` are **not** in this diff and must not be deployed as part of the parser release.

## DETERMINISTIC SAFETY SUITE
pending re-run after rebase (previously 500 / 500 PASS on stacked branch)

Layer A still calls `interpretCapture()` directly. `parser_generated_dose = ABSENT` on every row. See `audit/PARSER_500_REPORT.md`.

## SEMANTIC LANGUAGE SUITE
pending live-model run (`LIVE_SEMANTIC_SUITE=1` with production `OPENAI_API_KEY`)

Layer B calls `overlayLanguageModelCapture()`, the same function used by `POST /api/v1/captures`.

See `audit/PARSER_SEMANTIC_REPORT.md`.

## MODEL
name: gpt-4o-mini (default; production must confirm `OPENAI_INTERPRETATION_MODEL`)
prompt version: diabetes-event-v2
schema version: diabetes_language_event
parser version: semantic-events-v1
actual model used: not yet recorded (live suite not run)

## GLUCOSE UNIT POLICY
Documented product policy, not accidental:

* Parser leaves unit unresolved unless the utterance states mmol/L or mg/dL.
* Review UI may apply the saved profile unit downstream (`NaturalLanguageReviewScreen`).
* Parser never converts mmol/L ↔ mg/dL.

## SAFETY-CRITICAL FAILURES
not yet recorded on the live model

## NON-CRITICAL FAILURES
not yet recorded on the live model

## KNOWN PRODUCTION FAILURE REGRESSIONS
sandwich multi-event: PASS on deterministic overlay / capture API tests
banana/bread/butter: PASS
symptom preservation: PASS
time binding: PASS
conflicting readings: PASS
dose invention: PASS
settings mutation: PASS

Live production UI sandwich case: NOT VERIFIED in this environment (no production deploy).

## LATENCY
median: not measured (live suite pending)
p95: not measured

## COST
average parse: n/a until live suite
suite cost: n/a until live suite

## PRODUCTION SMOKE
NOT RUN

## KNOWN LIMITATIONS
* Voice remains browser Web Speech → text; server `transcribeFinishedRecording` is still unwired.
* `packages/bolus/src/` is unchanged.
* Nutrition Tracker / `0013_nutrition.sql` is unrelated and is not part of this parser PR.
* Unresolved food must never display as 0 g carbohydrate; review UI shows confirmation copy instead of a carb total until every ingredient is resolved.

## MERGE GATE
**PR #8 is not safe to merge** until:

1. DETERMINISTIC SAFETY SUITE is 500 / 500 PASS
2. Live SEMANTIC LANGUAGE SUITE is 150 / 150 PASS through `overlayLanguageModelCapture`
3. Safety-critical failures: 0
4. Nutrition Tracker / `0013_nutrition.sql` remain out of this diff

## BETA STATUS
NOT READY

Do not describe the parser as beta-ready because the 500-phrase suite passes, or because the 150-phrase suite passes without a live model through production.
