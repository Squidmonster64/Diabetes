# API contract

Base path: `/api/v1`. All request/response bodies are JSON. All clinical
decimal values cross the API boundary as canonical decimal strings (e.g.
`"6"`, `"4.25"`), never as JavaScript numbers, per
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 4.

## Authentication

Protected routes require `Authorization: Bearer <supabase-access-token>`.
The API verifies the token's signature against `SUPABASE_JWT_SECRET` and
never trusts a patient/user id supplied in the request body or query string
- the authenticated patient id always comes from the verified token.

In local development, when Supabase environment variables are not set, the
API falls back to reading an `X-Dev-Patient-Id` header instead (refused
outright when `NODE_ENV=production`).

## Error contract

```json
{
  "error": {
    "code": "REFUSAL_OR_ERROR_CODE",
    "message": "Human-readable message.",
    "requestId": "uuid"
  }
}
```

## Routes

### `GET /api/v1/health`

Public. Returns `{ status, mode, databaseSha256, calculatorVersion }`.

### `GET /api/v1/foods/search?q=&sourceDataset=&page=&pageSize=`

Public. Ranked Australian food search. See [`FOOD_ADAPTER.md`](FOOD_ADAPTER.md)
for ranking rules.

### `GET /api/v1/foods/:sourceDataset/:sourceFoodId`

Public. Food details and provenance.

### `GET /api/v1/foods/:sourceDataset/:sourceFoodId/measures`

Public. Household measures (AUSNUT 2023 only in this database).

### `POST /api/v1/foods/calculate-carbohydrate`

Public. Body: `{ sourceDataset, sourceFoodId, kind: "GRAMS"|"MILLILITRES"|"MEASURE", ... }`.
Returns the neutral food-module result contract (see [`FOOD_ADAPTER.md`](FOOD_ADAPTER.md)).

### `GET /api/v1/settings/current` (auth required)

Returns the patient's active `ClinicianSettingsRecord`, or `404
NO_ACTIVE_CONFIGURATION`.

### `GET /api/v1/settings/history` (auth required)

Returns `{ history: ClinicianSettingsRecord[] }`, newest version first.

### `POST /api/v1/settings` (auth required)

Creates a new immutable settings version, superseding any prior `ACTIVE`
version. Requires `insulinDurationPatientConfirmedAccurate: true`. See
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 2.2 for the full
patient-entered-DIA workflow this implements.

### `POST /api/v1/bolus/preview` (auth required)

Runs the full deterministic bolus calculation
(`calculateBolusPreview` from `packages/bolus`). Returns either a
`BolusSuccess` (status `CALCULATED`/`CALCULATED_ZERO`) or a `BolusRefusal`
(status `REFUSED`) - see [`BOLUS_MODULE.md`](BOLUS_MODULE.md) and
[`SAFETY_MODEL.md`](SAFETY_MODEL.md).

### `POST /api/v1/bolus/previews/:previewId/confirm` (auth required)

Body: `{ confirmedAt, expectedSnapshotHash }`. Idempotent: a second
confirmation of the same calculation returns `409 DUPLICATE_CONFIRMATION`
rather than creating a duplicate record.

### `POST /api/v1/bolus/previews/:previewId/reject` (auth required)

Body: `{ rejectedAt, reason }`. Invalidates the preview; it can no longer be
confirmed.

### `POST /api/v1/administrations` (auth required)

Body: `{ calculationId, administeredUnits, administeredAt }`. Records the
actual administered dose, separately from the calculated dose, after
confirmation.

### `GET /api/v1/history` / `GET /api/v1/history/:eventId` (auth required)

Returns the authenticated patient's own calculation history only (RLS and
API-level ownership checks both enforce this - see
[`audit/RLS_REVIEW.md`](audit/RLS_REVIEW.md)).
