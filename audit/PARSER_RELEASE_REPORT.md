# PARSER RELEASE REPORT

Commit: 265cab3 (plus this report)
Branch: cursor/semantic-language-suite-b328
PR: https://github.com/Squidmonster64/Diabetes/pull/8
Production SHA: not deployed by this change
Production URL: https://diabetes-companion-app-production.up.railway.app

## SCOPE
PR #8 is rebased onto `origin/main` with meal-parser P0, shared AI interpretation, the 500-phrase suite, and the semantic suite.

`git diff --name-only origin/main...HEAD` contains **no** `apps/nutrition`, `packages/food-engine`, or `supabase/migrations/0013_nutrition.sql`. Nutrition Tracker must not be deployed as part of this parser release.

## DETERMINISTIC SAFETY SUITE
500 / 500 PASS

Layer A still calls `interpretCapture()` directly. `parser_generated_dose = ABSENT` on every row. Re-run after overlay safety fix: 2026-08-27T06:44:56Z. See `audit/PARSER_500_REPORT.md`.

## SEMANTIC LANGUAGE SUITE
150 / 150 PASS

Layer B called `overlayLanguageModelCapture()`, the same function used by `POST /api/v1/captures`, with `LIVE_SEMANTIC_SUITE=1` and the production OpenAI key. Fallbacks: 0 / 150.

First live run (diabetes-event-v2): 149 / 150 PASS, 1 safety-critical failure (SEM-034). Overlay was marking "I think I took 6 units" as INSULIN_TAKEN/TAKEN. Fixed in diabetes-event-v3 by keeping deterministic UNCERTAIN/REQUESTED status. Second live run: 150 / 150 PASS, 0 safety-critical failures. Generated 2026-08-27T06:52:43Z.

See `audit/PARSER_SEMANTIC_REPORT.md`.

## MODEL
requested name: DEFAULT_INTERPRETATION_MODEL (`OPENAI_INTERPRETATION_MODEL` / `DEFAULT_INTERPRETATION_MODEL`)
actual model used: DEFAULT_INTERPRETATION_MODEL snapshot 2024-07-18 (OpenAI `model` field on Chat Completions)
prompt version: diabetes-event-v3
schema version: diabetes_language_event
parser version: semantic-events-v1
temperature: 0
timeout: 30s
fallbacks: 0

## GLUCOSE UNIT POLICY
Documented product policy, not accidental:

* Parser leaves unit unresolved unless the utterance states mmol/L or mg/dL.
* Review UI may apply the saved profile unit downstream (`NaturalLanguageReviewScreen`).
* Parser never converts mmol/L ↔ mg/dL.

## SAFETY-CRITICAL FAILURES
0 on the live-model Layer B re-run.

Live failure that was fixed before this report:

* SEM-034 SAFETY_CRITICAL — "I think I took 6 units" must not be INSULIN_TAKEN/TAKEN. Overlay merge now preserves UNCERTAIN.

## NON-CRITICAL FAILURES
none in the 150-phrase live suite.

## KNOWN PRODUCTION FAILURE REGRESSIONS
sandwich multi-event: PASS (live overlay + capture API tests)
banana/bread/butter: PASS
symptom preservation: PASS
time binding: PASS
conflicting readings: PASS
dose invention: PASS
settings mutation: PASS
uncertain insulin (SEM-034): PASS after v3 fix

Live production UI sandwich case: NOT VERIFIED in this environment (no production deploy of this PR).

## LATENCY
Live overlay only (150 calls, 2026-08-27T06:52:43Z):

* min: 1693 ms
* median: 2600 ms
* mean: 2883 ms
* p90: 4185 ms
* p95: 5486 ms
* max: 7016 ms

## COST
Token usage for the live 150-phrase suite: prompt 159627 / completion 35844 / total 195471.

Estimated at DEFAULT_INTERPRETATION_MODEL list rates ($0.15 / 1M prompt, $0.60 / 1M completion): **$0.0455** for the suite (~$0.0003 per parse). This is an estimate from token counts, not an invoice.

## PRODUCTION SMOKE
NOT RUN on the deployed Railway app for this SHA.

## KNOWN LIMITATIONS
* Voice remains browser Web Speech → text; server `transcribeFinishedRecording` is still unwired.
* `packages/bolus/src/` is unchanged.
* Nutrition Tracker / `0013_nutrition.sql` is unrelated and is not part of this parser PR.
* Unresolved food must never display as 0 g carbohydrate; review UI shows confirmation copy instead of a carb total until every ingredient is resolved.
* Passing both suites does not by itself mean the live production UI understands the sandwich case until that path is deployed and smoked.

## MERGE GATE
**PR #8 is safe to merge.**

1. DETERMINISTIC SAFETY SUITE 500 / 500 PASS
2. Live SEMANTIC LANGUAGE SUITE 150 / 150 PASS through `overlayLanguageModelCapture`
3. Safety-critical failures: 0
4. Nutrition Tracker / `0013_nutrition.sql` are out of this diff

This agent did not merge the PR.

## BETA STATUS
NOT READY as a product beta.

Do not describe the parser as beta-ready because the suites pass. Production deploy + the sandwich utterance on the live app are still required before any beta claim.
