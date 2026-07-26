# Known limitations and unresolved risks

**Clinical status: not approved for treatment use.** This list exists so a
clinician, reviewer, or future engineer can see exactly what remains before
any real-world use - see [`CLINICIAN_REVIEW_CHECKLIST.md`](CLINICIAN_REVIEW_CHECKLIST.md).

## Clinical / regulatory (release blockers - not closeable by engineering alone)

1. **No clinician golden dataset.** No independently calculated reference
   dataset (routine, boundary, adverse, and misuse cases, including both
   mmol/L and mg/dL configurations) has been reviewed and approved by a
   clinician. Engineering test fixtures are derived from the handoff
   document's own worked examples, not an independent clinical source.
2. **Time-window boundaries not clinically approved.** The 15-minute
   glucose-freshness limit and the 5-minute preview-confirmation window are
   implemented exactly as the handoff proposes, but the handoff itself
   marks both as pending clinician approval or replacement.
3. **No formal risk-management file or regulatory pathway assessment.**
4. **No human-factors/usability validation** of refusal wording,
   confirmation wording, or screen flow with real patients.
5. **Paediatric/adult identity enforcement is not backed by a verified
   identity-of-record.** `context.patientIsAdult` (gate 27) is currently
   supplied by the API caller (a client-controllable header in development
   mode) rather than a verified profile field. A production deployment must
   source this from a durable, clinician/patient-verified profile value.
6. **Emergency escalation (gate 21) is a checkbox, not a dedicated flow.**
   `UNCONSCIOUS_OR_UNABLE_TO_SWALLOW` is one entry in a general "special
   situations" checklist in `GlucoseEntryScreen.tsx`, not a prioritised,
   separately-designed emergency declaration. This needs human-factors
   review before real-world use.

## Engineering (tracked, not release blockers for a continued-engineering disposition)

7. **Settings-version creation is not fully transactional.**
   `SupabaseSettingsRepository.createVersion` (`apps/api/src/repositories/supabase.ts`)
   performs a read-then-write sequence, not a single atomic Postgres
   transaction. A partial unique index prevents two `ACTIVE` configurations
   from silently coexisting under a race, but a race surfaces as an insert
   error rather than being prevented outright. See `SUPABASE_SETUP.md`.
8. **RLS has been exercised against the live connected Supabase project**
   using the anon and service-role keys directly (see `RLS_REVIEW.md`), but
   not yet with two independently signed-in (magic-link) end users through
   the deployed UI. Do this once real users are onboarded.
9. **No offline queue yet.** The PWA's service worker caches only the
   static app shell; there is no client-side write-behind queue for
   non-clinical sync operations, and no locally cached history for offline
   viewing, despite the `sync_metadata` table existing in the schema. The
   app requires network connectivity for every clinical operation and fails
   visibly rather than degrading silently - see `OFFLINE_BEHAVIOR.md`.
10. **No true browser-DOM Playwright e2e tests.** `tests/e2e` drives the API
    directly over HTTP (Playwright's `request` fixture), not the rendered
    React app, because completing real browser-driven auth would require
    either a live Supabase project or a test-only auth bypass wired into
    shipped code - the latter would be a security regression, so it was not
    built. Additionally, `npx playwright install chromium` reported
    "Playwright does not support chromium on mac13" on the build host,
    independent of the auth question.
11. **`npm run lint` is aliased to `npm run typecheck`.** No ESLint
    configuration has been added; TypeScript's strict `--noEmit` check is
    the current static-analysis gate.
12. **PWA icons are minimal placeholders**, not designed brand assets
    (`apps/web/public/icons/*.png`, generated programmatically as solid
    dark-navy squares matching the theme colour).
13. **Household measures are AUSNUT-only in this database.** AFCD items
    (both solid and liquid) have no household-measure rows in
    `australian_foods.sqlite`; the UI offers gram/millilitre entry for
    those instead, which is a data-source limitation, not a code defect.
14. **Glucose trend is accepted as provenance only** and genuinely never
    enters arithmetic (per handoff conflict C-09), but the UI does not yet
    collect it in `GlucoseEntryScreen.tsx` - it is always submitted as
    `null`. The clinical policy for a rapid trend without symptoms remains,
    per the handoff, an open clinician-review decision regardless.
15. **`npm audit` reports two unresolved high-severity advisories** in
    `apps/web`'s dependency tree: a `brace-expansion` ReDoS in a transitive
    build-tool dependency of `vite-plugin-pwa`, and a `react-router` "RSC
    Mode CSRF Bypass" advisory. Neither applies to this app's actual usage
    (no RSC/server actions are used; the ReDoS path is a build-time-only
    tool), but no patched version was available without a breaking major
    upgrade at build time - tracked here rather than silently ignored.

## Production bugs found and fixed during live deployment validation

Three defects existed in the Supabase-backed code path that unit and
integration tests (which use in-memory or directly-scripted repositories)
did not catch, because they only manifest against a real Postgres instance
and a real Supabase-issued token. All three were found by authenticating
with a real (synthetic) Supabase session against the deployed production API
and are now fixed and verified live:

- **Auth verification assumed a static HS256 JWT secret.** This project
  issues `ES256`-signed tokens via Supabase's newer JWT signing keys
  feature; every real login would have failed authentication with `401`.
  Fixed by verifying against the project's JWKS endpoint first
  (`apps/api/src/auth/verifyJwt.ts`), falling back to the legacy HS256
  secret for projects that still use one.
- **`audit_events.calculation_id` had a hard foreign key to
  `calculations(id)`**, but the audit trail correctly writes
  `CALCULATION_STARTED` before any `calculations` row exists (required
  fail-closed ordering per handoff section 9.1). Every calculation attempt
  refused with `AUDIT_PERSISTENCE_FAILURE`. Fixed by
  `supabase/migrations/0007_audit_events_drop_calculation_fk.sql`, which
  drops the FK; the column remains as a plain correlating UUID.
- **`computeConfigurationChecksum` compared timestamps as raw strings**, but
  Postgres round-trips `timestamptz` values with a `+00:00` suffix instead
  of the original `Z` suffix used at write time. Every calculation after a
  settings reload refused with `CONFIGURATION_INTEGRITY_FAILURE`. Fixed by
  normalizing timestamps via `Date.toISOString()` before hashing on both
  sides (`packages/bolus/src/settings.ts`).
- **Refused calculations read back from history had blank
  `userFacingMessage`/`blockingReason`/`safeNextStep`** (hardcoded empty
  strings in `rowToCalculationRecord`); now reconstructed from the stored
  `refusal_code` via `REFUSAL_TEMPLATES`.

This is recorded as a limitation, not just a changelog entry, because it
demonstrates that **in-memory/mocked-repository test coverage alone does
not validate the Supabase-backed persistence path** - a lesson for the next
schema or repository change: verify it against a real connected project,
not only the test suites.

## Custom foods and saved meals (`feature/custom-foods-saved-meals`)

16. **No hard-delete for custom foods or meals.** Both are archive-only by
    design, so a saved meal can never end up referencing a deleted food -
    the `custom_foods` → `saved_meal_components` foreign key uses `on delete
    restrict` rather than allowing removal. A patient who wants a food or
    meal fully gone only gets "archived, hidden from lists," not erased.
17. **No packet-photo/OCR label scanning.** Packet-label entry is manual
    text/number entry transcribed by the patient from the nutrition panel,
    not a camera/OCR capture flow.
18. **Meal component search UI is grams-only.** The API supports
    millilitre- and household-measure-based quantities for official-food
    meal components (`quantityKind: "MILLILITRES" | "MEASURE"`), but
    `MealEditScreen.tsx` only exposes gram entry for simplicity. Adding
    measure/millilitre pickers to that screen is a UI-only gap, not an API
    limitation.
19. **Editable-quantity overrides apply to the whole meal, not partial
    saves.** `MealUseScreen.tsx`'s "Recalculate" step lets a patient adjust
    every component's quantity for one use without persisting anything;
    there is no partial "save some of these changes back to the recipe"
    flow - the patient must go to "Edit meal" separately to persist a
    lasting change.

## Natural-language event entry (`packages/natural-language`, `feature/natural-language-entry`)

20. **Deterministic regex extraction, not a language model.** The parser
    handles the phrasing patterns exercised by its acceptance tests (stated
    number/word quantities, common relative and clock times, "with"/"and"/
    comma-separated food lists, vague qualifiers like "a little"/"some", a
    small set of hypoglycaemia/special-situation keywords). Phrasing outside
    those patterns degrades to a "not stated" / missing clarification rather
    than a wrong guess, but it also means less common phrasings simply
    aren't extracted yet rather than being extracted incorrectly. No
    language-model fallback is wired up (the spec permits one only as an
    optional, schema-validated, never-auto-trusted extra path; none is
    configured in this build).
21. **Single-clause time attribution.** Relative/absolute time phrases are
    resolved per sentence-clause (split on `.`/`;`/"while", with decimal
    points protected from being read as clause breaks). A clause containing
    two independent time references (e.g. an insulin time and an unrelated
    food time in the same clause with no punctuation between them) could
    misattribute the second time phrase - not exercised by any current
    example, but a known sharp edge of the clause-scoped design in
    `segment-event.ts`.
22. **Food-quantity-to-database-measure matching is best-effort for counts.**
    Gram and millilitre quantities map directly onto the existing
    `calculateCarbohydrate` endpoint. A count quantity ("two Weet-Bix") only
    auto-resolves when the matched AUSNUT/AFCD food happens to expose a
    measure with `quantity === 1`; otherwise the review screen falls back to
    manual gram entry for that component. Custom-food count quantities only
    auto-resolve when the custom food has a recorded `servingGrams`.
23. **The negligible-carbohydrate allow-list is small and fixed**
    (`NEGLIGIBLE_CARB_FOODS` in `extract-foods.ts`: ham, chicken, turkey,
    beef, bacon, egg(s), cheese, lettuce, mayo, mayonnaise, mustard). A food
    outside that list with no stated quantity always blocks with a
    clarification question rather than being silently treated as
    negligible - a deliberate conservative bias, but the list itself has not
    been clinically reviewed.
24. **The confirmed carbohydrate total for a natural-language meal is
    packaged as a single synthetic `CarbohydrateCalculationResult`**
    (`sourceFoodId: "natural-language-entry"`) rather than a persisted
    multi-component meal record - unlike saved meals, a described meal is
    not itself retained as a reusable recipe; the patient would need to
    separately save it via the existing "saved meals" flow if they want to
    reuse it.

## What is *not* a limitation (deliberately out of scope per the handoff)

Basal/premixed/IV/pump dosing, split/extended/dual-wave boluses, paediatric
and pregnancy dosing, sick-day/ketone/vomiting/dehydration dosing, exercise/
alcohol/steroid/renal adjustments, any insulin-on-board curve, and any
AI/ML-driven dosing logic are intentionally absent - see `SAFETY_MODEL.md`.
