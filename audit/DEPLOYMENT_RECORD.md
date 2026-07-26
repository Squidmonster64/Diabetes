# Deployment record

## Status: not yet deployed to Railway

This environment cannot authenticate to Railway, GitHub, or Supabase on the
operator's behalf. Deployment configuration is complete and has been
verified locally (below); the remaining steps require the repository owner
to connect accounts. See `RAILWAY_DEPLOYMENT.md` and `SUPABASE_SETUP.md` for
the exact next actions.

| Field | Value |
|---|---|
| Production URL | not yet assigned |
| Railway project/service ID | not yet created |
| Supabase project ref | not yet created |
| Deployment commit hash | see `git log -1` after the initial commit (this build's Git history) |
| Deployment date | not yet deployed |

## Local production-build verification (completed this session)

The following was run and observed directly, not assumed:

1. `npm run build` - full monorepo production build succeeds (all five
   workspaces: `shared-types`, `food-contracts`, `bolus`, `apps/api`,
   `apps/web`).
2. `node apps/api/dist/src/server.js` (compiled output, `NODE_ENV=production`,
   no dev server) started successfully and:
   - `GET /api/v1/health` → `200`, returned the correct database SHA-256
     (`af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`) and
     calculator version `0.6.0`.
   - `GET /` served the built PWA shell (`index.html`) with
     `Cache-Control: no-cache, no-store, must-revalidate`.
   - `GET /history` (an unknown client-side route) correctly fell back to
     `index.html` (SPA fallback) rather than 404ing.
   - `GET /api/v1/does-not-exist` correctly returned a JSON `404
     NOT_FOUND` (API routes are never swallowed by the SPA fallback).
   - `GET /assets/<hashed>.js` returned
     `Cache-Control: public, max-age=31536000, immutable`.
   - `GET /sw.js` returned `Cache-Control: no-cache, no-store, must-revalidate`.
   - `GET /manifest.webmanifest` → `200`.
3. Database checksum verification confirmed: the server computed and
   compared the SHA-256 against `docs/data-source/australian_foods.sqlite.sha256`
   before opening the database, per `apps/api/src/db.ts`.
4. Full test suite green against this same build (see `TEST_RESULTS.md`):
   102 bolus unit tests, 52 API unit/integration tests, 2 web unit tests,
   8 Playwright black-box e2e tests - 164/164 passed.

## Production smoke-test checklist (run after deployment)

Copy this list when the production URL is live - do not enter real patient
data (`APP_BUILD_PROMPT.md` section 20):

- [ ] `GET /api/v1/health` returns `200` and the expected database SHA-256.
- [ ] The PWA loads at the production URL.
- [ ] `manifest.webmanifest` loads and the browser offers "Add to Home
      Screen" / install.
- [ ] The service worker registers (check DevTools → Application → Service
      Workers).
- [ ] Sign-in with a real (test) email starts the Supabase magic-link flow.
- [ ] Food search returns Weet-Bix.
- [ ] "apple" ranks an exact/whole-word match first (not a substring match
      like "apple cider").
- [ ] Household-measure lookup works for an AUSNUT item.
- [ ] Carbohydrate calculation works for a chosen portion.
- [ ] A bolus preview is produced via the deterministic module (verify the
      response includes `calculationVersion`/`safetyPolicyVersion`).
- [ ] A refusal gate (e.g. low glucose) is reachable and refuses correctly.
- [ ] Confirming a preview creates exactly one history record; confirming
      again returns a duplicate-confirmation error, not a second record.
- [ ] History loads for the signed-in test user.
- [ ] Settings versioning works (create, then update, then check history).
- [ ] An unauthenticated request to a protected route is rejected.
- [ ] A second test user cannot see the first test user's history or
      settings.
- [ ] The production database's SHA-256 (via `/api/v1/health`) matches
      `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`.

## Supabase migration state

Migrations exist and have been reviewed (`supabase/migrations/0001`-`0006`)
but have **not been applied** to any live Supabase project from this
environment - no project has been created/linked here. Apply via `supabase
db push` after `supabase link` (see `SUPABASE_SETUP.md`).
