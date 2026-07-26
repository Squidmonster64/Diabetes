# Data model

Two separate databases are involved, with a strict boundary between them
(see [`FOOD_ADAPTER.md`](FOOD_ADAPTER.md) and [`BOLUS_MODULE.md`](BOLUS_MODULE.md)):

- **`data/australian_foods.sqlite`** - read-only Australian food composition
  data (AUSNUT 2023, AFCD Release 3). Never written to at runtime.
- **Supabase Postgres** - all user-owned clinical and audit data.

## Supabase schema

Defined in [`supabase/migrations/`](supabase/migrations). Every table below
has Row Level Security enabled with a `select`-only policy scoped to
`auth.uid() = patient_id`; all writes go through the API using the
service-role key.

```text
auth.users (Supabase-managed)
      │
      ├──< profiles                        (0001) one row per patient
      │
      ├──< clinician_configurations        (0002) versioned settings
      │        exactly one ACTIVE per patient (partial unique index)
      │
      ├──< calculation_requests            (0003) immutable input snapshot
      │        │
      │        └──1 calculations           (0003) result / refusal
      │                 │
      │                 ├──0..1 calculation_confirmations   (0004)
      │                 ├──0..n insulin_administrations     (0004)
      │                 └──< audit_events                   (0005)
      │
      └──< sync_metadata                   (0006) offline queue bookkeeping
```

### `clinician_configurations`

Patient-entered values transcribed from a current clinician-approved report
or treatment plan (never derived or suggested by the app). See
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 2 and 7.1 for the full
field list and validation rules. Key invariants:

- `version` is unique per `patient_id` and strictly increasing.
- At most one row per patient has `status = 'ACTIVE'` (enforced by
  `clinician_configurations_one_active_per_patient`).
- `insulin_duration_patient_confirmed_accurate` must be `true` (a database
  check constraint) - the app must not activate DIA without explicit patient
  confirmation of accurate transcription.
- Rows are never updated once created, except for status transitions
  (`ACTIVE → SUPERSEDED/REVOKED/EXPIRED`) performed by the API.

### `calculations`

One row per calculation attempt (success, zero-result, or refusal). A
`calculations_refusal_has_no_dose` check constraint enforces that a refused
row never carries dose fields - refusals must not expose a hidden or
recoverable numeric dose.

### `calculation_confirmations` / `insulin_administrations`

Separate tables per handoff section 7.5/7.6: a confirmed **preview** is not
the same as a recorded **administration**. The administered amount may
differ from the calculated amount and is never used to overwrite the
calculation.

### `audit_events`

Immutable, hash-chained (`previous_hash` / `event_hash`) append-only log,
distinct from both the user-visible `calculations` history and from
operational application logs (see [`PRIVACY_MODEL.md`](PRIVACY_MODEL.md)).
No `update`/`delete` policy exists for any role.

## Australian food database views

See [`docs/data-source/application_views_report.md`](docs/data-source/application_views_report.md)
and [`FOOD_ADAPTER.md`](FOOD_ADAPTER.md) for the `app_*` view schema used by
the food adapter.
