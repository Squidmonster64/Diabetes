# PARSER RELEASE REPORT

Commit: 2cb2ab7
Branch: cursor/semantic-language-suite-b328
PR: https://github.com/Squidmonster64/Diabetes/pull/8
Production SHA: not deployed by this change
Production URL: https://diabetes-companion-app-production.up.railway.app

## SCOPE
PR #8 is rebased onto `origin/main` with meal-parser P0, shared AI interpretation, the 500-phrase suite, and the semantic suite.

`git diff --name-only origin/main...HEAD` contains **no** `apps/nutrition`, `packages/food-engine`, or `supabase/migrations/0013_nutrition.sql`. Nutrition Tracker must not be deployed as part of this parser release.

## DETERMINISTIC SAFETY SUITE
500 / 500 PASS

Layer A still calls `interpretCapture()` directly. `parser_generated_dose = ABSENT` on every row. Re-run after rebase: 2026-08-27T01:24:11Z. See `audit/PARSER_500_REPORT.md`.

## SEMANTIC LANGUAGE SUITE
150 / 150 PASS on the production overlay **with deterministic fallback** (no live key in this Cloud Agent VM)

Layer B calls `overlayLanguageModelCapture()`, the same function used by `POST /api/v1/captures`.

A live-model rerun requires `OPENAI_API_KEY` in this environment and `LIVE_SEMANTIC_SUITE=1`. That run has **not** completed. See `audit/PARSER_SEMANTIC_REPORT.md`.

## MODEL
name: gpt-4o-mini (default; production must confirm `OPENAI_INTERPRETATION_MODEL`)
prompt version: diabetes-event-v2 (live) / deterministic-only (this VM)
schema version: diabetes_language_event (live) / semantic-events-v1 (this VM)
parser version: semantic-events-v1
actual model used: **not recorded** — this VM has no `OPENAI_API_KEY`

## GLUCOSE UNIT POLICY
Documented product policy, not accidental:

* Parser leaves unit unresolved unless the utterance states mmol/L or mg/dL.
* Review UI may apply the saved profile unit downstream (`NaturalLanguageReviewScreen`).
* Parser never converts mmol/L ↔ mg/dL.

## SAFETY-CRITICAL FAILURES
0 on Layer A and on Layer B deterministic overlay. Live-model safety-critical count: **not yet recorded**.

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

Live production UI sandwich case: NOT VERIFIED in this environment (no production deploy, no OpenAI key in this VM).

## LATENCY
median: not measured (no live model in this VM)
p95: not measured

## COST
average parse: n/a (deterministic overlay)
suite cost: $0 in this VM

## PRODUCTION SMOKE
NOT RUN

## KNOWN LIMITATIONS
* This Cloud Agent VM has no `OPENAI_API_KEY`. Overlay is identity. Semantic richness from gpt-4o-mini is unproven here.
* Voice remains browser Web Speech → text; server `transcribeFinishedRecording` is still unwired.
* `packages/bolus/src/` is unchanged.
* Nutrition Tracker / `0013_nutrition.sql` is unrelated and is not part of this parser PR.
* Unresolved food must never display as 0 g carbohydrate; review UI shows confirmation copy instead of a carb total until every ingredient is resolved.

## MERGE GATE
**PR #8 is not safe to merge.**

The live-model Layer B suite has not been run. Fixture 150/150 on deterministic overlay is not a live-model pass.

Required before merge:

1. DETERMINISTIC SAFETY SUITE 500 / 500 PASS — done after rebase
2. Live SEMANTIC LANGUAGE SUITE 150 / 150 PASS through `overlayLanguageModelCapture`
3. Safety-critical failures: 0 on the live model
4. Nutrition Tracker / `0013_nutrition.sql` remain out of this diff — done

## BETA STATUS
NOT READY

Do not describe the parser as beta-ready because the 500-phrase suite passes, or because the 150-phrase suite passes without a live model through production.
