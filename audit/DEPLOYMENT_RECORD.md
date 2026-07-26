# Deployment record

## Status: deployed and live

| Field | Value |
|---|---|
| Production URL | https://diabetes-companion-app-production.up.railway.app |
| Railway project | `diabetes-companion-app` (`68780304-2985-40dc-99d0-0a41d5f4a1d1`), workspace `squidmonster64's Projects` |
| Railway service | `diabetes-companion-app` (`959ad808-32f9-4da9-8f9a-2ccf672ce821`) |
| Supabase project ref | `nzhqqhgjjtzozjbzvsaq` (ap-southeast-2) |
| Deployed commit | `5d75bbb` (fixes) on top of `dec544a`/`799fb7f` (initial build) |
| Deployment ID | `66fd274f-a83b-49c4-a270-c8c452bd799a` - `SUCCESS` |
| Deployment date | 2026-07-26 |

GitHub repository `Squidmonster64/Diabetes`, branch `main`, connected to the
Railway service for auto-deploy on push.

## Production smoke-test results (executed against the live URL)

All items below were run directly against
`https://diabetes-companion-app-production.up.railway.app`, not assumed:

- [x] `GET /api/v1/health` → `200`, `"mode":"supabase"` (durable
      repositories active, not the in-memory dev fallback), database SHA-256
      matches `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`.
- [x] The PWA loads at the production URL (`index.html`,
      `no-cache, no-store, must-revalidate`).
- [x] `manifest.webmanifest` loads (`200`).
- [x] The service worker (`sw.js`) is served (`200`,
      `no-cache, no-store, must-revalidate`).
- [x] Food search returns Weet-Bix (`AFCD_RELEASE_3`, `WHOLE_WORD` match).
- [x] "apple" ranks a `PREFIX` match ("Apple, dried") first - not a
      substring-only match.
- [x] Carbohydrate calculation works (30 g Weet-Bix → 17 g carbohydrate).
- [x] Unauthenticated request to a protected route rejected (`401`).
- [x] A real Supabase-authenticated session (synthetic test user, created
      via the admin API and signed in with a password, then deleted after
      testing - see below) successfully:
      - created a settings version,
      - received a `CALCULATED` bolus preview for both `MEAL` and
        `CORRECTION_ONLY` modes,
      - confirmed a preview (`USER_CONFIRMED`),
      - had a second confirmation of the same calculation rejected
        (`409 DUPLICATE_CONFIRMATION`),
      - received a correct `HYPO_THRESHOLD` refusal for low glucose,
      - saw all of the above (plus an earlier refusal, pre-fix) in their
        own history with correct refusal messages reconstructed from
        `refusal_code`.
- [x] Production database SHA-256 (via `/api/v1/health`) matches the local
      source checksum.

Not yet exercised in production: cross-user isolation with two independent
*real* (magic-link) end users through the deployed UI (verified instead at
the API/RLS layer directly with anon vs. service-role keys - see
`RLS_REVIEW.md` - and via the integration/e2e test suites using distinct
synthetic patient IDs).

## Bugs found and fixed during this validation

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md#production-bugs-found-and-fixed-during-live-deployment-validation)
for full detail: a JWT-verification algorithm mismatch (ES256 JWKS vs.
assumed HS256), a foreign-key ordering conflict in the audit trail, a
timestamp round-trip breaking the settings checksum, and blank refusal
messages in history. All four are fixed, deployed (commit `5d75bbb`), and
re-verified live per the checklist above.

## Synthetic test-data hygiene

The test user (`deployment-smoketest-synthetic-user@example.com`) and every
row it created (settings, calculations, audit events - all cascade-deleted
via the `patient_id → auth.users(id) on delete cascade` foreign keys) were
removed after validation. No real patient data was entered at any point.

## Supabase migration state

All 7 migrations applied to the live project via `supabase db push`
(migrations 0001-0006 during initial setup, 0007 as a live-validation fix):
`clinician_configurations`, `calculations`, `calculation_confirmations`,
`insulin_administrations`, `audit_events`, `sync_metadata`, plus the
`audit_events` foreign-key fix. RLS verified live (see `RLS_REVIEW.md`).

## Outstanding manual step

**Supabase Auth URL Configuration** (Site URL / additional redirect URLs)
has not been set to the production URL yet - this is a dashboard-only
setting not reachable via the database connection or anon/service-role
keys used elsewhere in this deployment. Set, in the Supabase dashboard
under **Authentication → URL Configuration**:

- Site URL: `https://diabetes-companion-app-production.up.railway.app`
- Additional redirect URLs: `http://localhost:5173` (for local development)

Until this is set, magic-link sign-in emails will redirect to the wrong
origin.
