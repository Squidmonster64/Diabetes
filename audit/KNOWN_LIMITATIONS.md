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
8. **RLS has not been exercised against a live Supabase project.** Policies
   are written and reviewed (`audit/RLS_REVIEW.md`) but no Supabase project
   has been connected in this build environment to verify them end-to-end
   against real authenticated sessions.
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

## What is *not* a limitation (deliberately out of scope per the handoff)

Basal/premixed/IV/pump dosing, split/extended/dual-wave boluses, paediatric
and pregnancy dosing, sick-day/ketone/vomiting/dehydration dosing, exercise/
alcohol/steroid/renal adjustments, any insulin-on-board curve, and any
AI/ML-driven dosing logic are intentionally absent - see `SAFETY_MODEL.md`.
