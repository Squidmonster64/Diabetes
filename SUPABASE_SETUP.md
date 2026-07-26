# Supabase setup

This app uses Supabase for authentication and durable, Row-Level-Security
protected storage of settings versions, calculations, confirmations, and
audit events. Migrations live in [`supabase/migrations/`](supabase/migrations)
and are the source of truth for the schema.

> **Current deployment**: project `nzhqqhgjjtzozjbzvsaq` (ap-southeast-2) is
> live, all 7 migrations are applied, and RLS is verified (see
> `audit/DEPLOYMENT_RECORD.md` and `audit/RLS_REVIEW.md`). **One step is
> still outstanding**: Authentication → URL Configuration (step 3 below)
> has not been set to the production URL yet.

## 1. Create a Supabase project

If you do not already have one: sign in at https://supabase.com, create a new
project, and note its **Project URL** and **anon public key** (Project
Settings → API). You will also need the **service-role key** from the same
page - keep it secret; it must only ever be used server-side.

## 2. Apply the migrations

With the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and
logged in:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies, in order:

1. `0001_profiles.sql` - one row per authenticated patient
2. `0002_clinician_configurations.sql` - immutable, versioned patient-entered
   settings, with a partial unique index enforcing exactly one `ACTIVE`
   configuration per patient
3. `0003_calculations.sql` - calculation requests and results
4. `0004_confirmations_and_administrations.sql` - confirmation and
   administration events
5. `0005_audit_events.sql` - immutable, hash-chained audit trail
6. `0006_sync_metadata.sql` - offline sync bookkeeping for the PWA
7. `0007_audit_events_drop_calculation_fk.sql` - drops a foreign key that,
   found during live deployment validation, incorrectly rejected the
   audit trail's required write-before-calculation-exists ordering (see
   `audit/KNOWN_LIMITATIONS.md`)

Every user-owned table has Row Level Security enabled with a `select`
policy scoped to `auth.uid() = patient_id`. No `insert`/`update`/`delete`
policies are granted to the `anon` or `authenticated` roles - all writes go
through the API using the service-role key, which bypasses RLS by design
(never expose that key to a browser). See
[`audit/RLS_REVIEW.md`](audit/RLS_REVIEW.md) for the full review.

## 3. Configure authentication

The app uses Supabase's email magic-link / OTP sign-in
(`supabase.auth.signInWithOtp`). In the Supabase dashboard:

- **Authentication → URL Configuration**: set the Site URL to your deployed
  web app origin (and add `http://localhost:5173` as an additional redirect
  URL for local development). **Outstanding for the current deployment**:
  set this to `https://diabetes-companion-app-production.up.railway.app`
  - not reachable via any API key or database connection used elsewhere in
  this setup; it must be set in the dashboard.
- **Authentication → Email Templates**: the default magic-link template is
  sufficient; customise wording if desired.

## 4. Environment variables

Copy `.env.example` and fill in the following (see that file for the full
list):

Frontend (`apps/web`, exposed to the browser - anon key only):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

Backend (`apps/api`, server-side only):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET` (Project Settings → API → JWT Settings) - the
  legacy shared secret. Token verification tries the project's JWKS
  endpoint first (for projects using the newer asymmetric JWT signing
  keys, which issue `ES256` tokens - discovered live in this deployment,
  see `audit/KNOWN_LIMITATIONS.md`) and falls back to this secret, so it's
  needed only for older/non-rotated projects.
- `SUPABASE_SERVICE_ROLE_KEY` - **never** put this in the frontend or commit
  it to git

When all four backend variables are present, `apps/api` automatically
switches from in-memory development repositories to the durable
Supabase-backed repositories (`apps/api/src/repositories/supabase.ts`) and
requires a verified Supabase access token on every protected route.

## 5. Seed data

[`supabase/seed.sql`](supabase/seed.sql) contains commented-out, non-clinical
example fixtures only. Do not seed real patient clinical data.

## Known limitation

Settings-version creation in the Supabase-backed repository is a
read-then-write sequence, not a single atomic transaction (see the doc
comment on `SupabaseSettingsRepository.createVersion`). The partial unique
index prevents two `ACTIVE` configurations from silently coexisting even
under a race - a race instead surfaces as an insert error, which is a safe
failure mode. See
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).
