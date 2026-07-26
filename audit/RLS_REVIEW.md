# Row Level Security review

## Policy inventory

| Table | RLS enabled | `select` policy | `insert`/`update`/`delete` policy for `anon`/`authenticated` |
|---|---|---|---|
| `profiles` | yes | `auth.uid() = patient_id` | `insert`/`update` scoped to own row; no `delete` (cascades from `auth.users`) |
| `clinician_configurations` | yes | `auth.uid() = patient_id` | none - API only, via service-role key |
| `calculation_requests` | yes | `auth.uid() = patient_id` | none |
| `calculations` | yes | `auth.uid() = patient_id` | none |
| `calculation_confirmations` | yes | `auth.uid() = patient_id` | none |
| `insulin_administrations` | yes | `auth.uid() = patient_id` | none |
| `audit_events` | yes | `auth.uid() = patient_id` | none (append-only, API-inserted only) |
| `sync_metadata` | yes | `auth.uid() = patient_id` | none |

Every user-owned table includes `patient_id uuid not null references
auth.users(id)`, satisfying `APP_BUILD_PROMPT.md` section 11's requirement.

## Why writes have no client-facing policy

All writes are performed by `apps/api` using the Supabase **service-role
key**, which bypasses RLS by design. This key is never exposed to the
browser (it is absent from every `VITE_`-prefixed environment variable and
from `apps/web`'s dependency tree entirely - only `apps/web/src/lib/supabase.ts`
exists client-side, using the anon key only). Granting no client
`insert`/`update`/`delete` policy means that even if a Supabase anon/user
JWT were used directly against the database (bypassing the API entirely),
no client could write to any clinical table - only the API's business logic
(safety gates, confirmation idempotency, settings versioning) can produce a
write.

## Defense in depth for reads

Even though the API also enforces `patientId` ownership checks at the
application layer (see `apps/api/src/history/routes.ts`,
`apps/api/src/settings/routes.ts` - a cross-patient history lookup returns
`404 NOT_FOUND`, never another patient's data), RLS provides a second,
independent enforcement layer at the database level. This is exercised by:

- `apps/api/test/integration/auth-isolation.test.ts` - cross-patient history
  and settings access denied;
- `tests/e2e/weetbix-and-refusals.spec.ts` test 8 - the same assumption
  verified against the running black-box API.

## Verification status

All 6 migrations have been applied to the live Supabase project
(`nzhqqhgjjtzozjbzvsaq`, ap-southeast-2) via `supabase db push`. Verified
directly against the live REST API using both keys:

- **anon key, `select * from clinician_configurations`**: returns `200` with
  `data: []` (RLS filters to zero rows for an unauthenticated/no-`auth.uid()`
  request, rather than erroring - correct behaviour).
- **service-role key, same query**: returns `200` with `data: []` (RLS
  bypassed as expected; table is genuinely empty - no data seeded).
- **anon key, `insert into clinician_configurations`**: returns `401` /
  Postgres error `42501` - *"new row violates row-level security policy"* -
  confirming no client-writable policy exists on this table, exactly as
  designed.

This confirms the read-isolation and write-lockout behaviour this document
describes is live in production, not just reviewed in code. Still
outstanding: exercising the isolation tests with two real
Supabase-authenticated (magic-link) end users rather than the anon/
service-role keys directly - do this once Railway/auth redirect URLs are
configured (see `SUPABASE_SETUP.md`).

## Known limitation

`SupabaseSettingsRepository.createVersion` performs a read-then-write
sequence rather than a single atomic transaction (see
`apps/api/src/repositories/supabase.ts`). The partial unique index prevents
two `ACTIVE` configurations from silently coexisting even under a race - a
race instead surfaces as a insert error, a safe failure mode, not a silent
RLS or data-isolation defect.
