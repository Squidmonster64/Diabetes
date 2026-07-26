# Privacy model

## Three separate log streams

1. **Operational logs** (`apps/api` Fastify/Pino logger) - request
   metadata for debugging. Redacts `Authorization`/`Cookie` headers at the
   logger level and passes any ad hoc context through
   `packages/bolus/src/logging.ts`'s `redact()`, which additionally strips
   known-clinical field names (`currentGlucose`, `carbohydrateGrams`, `icr`,
   `isf`, etc.) before anything is logged.
2. **Clinical calculation audit trail** (`audit_events` table /
   `AuditStore`) - immutable, hash-chained record of every calculation
   attempt, refusal, confirmation, and administration. Never sent to a
   third-party analytics service.
3. **User-visible history** (`calculations` table) - what the patient sees
   in the History screen.

These are never merged. See `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`
section 9.3 for the "never logged" list this implements.

## Never logged, never sent to analytics

- raw Supabase access/refresh tokens;
- service-role or other secrets;
- clinical values (glucose, carbohydrate grams, ICR/ISF/target/threshold) in
  operational logs;
- any health data to a third-party analytics service - none is integrated.

## URLs and query strings

No sensitive value (token, glucose, carbohydrate amount) is ever placed in a
URL or query string. Food search queries are plain text food names only.

## Minimisation

- The frontend Supabase client stores only what `@supabase/supabase-js`
  itself requires for session persistence (its own secure storage
  mechanism) - the app adds no additional client-side storage of tokens.
- The service worker precaches only the static app shell; it explicitly uses
  a `NetworkOnly` strategy for `/api/v1/foods/search` and `/api/v1/bolus/*`
  so no clinical request/response is ever cached (see
  [`OFFLINE_BEHAVIOR.md`](OFFLINE_BEHAVIOR.md)).

## Distinguishing calculation, confirmation, and administration

The database and the bolus module both keep these three concepts distinct
and never conflate them (handoff section 9's terminology, used exactly):

- a **calculated preview** (`CALCULATED`/`CALCULATED_ZERO`) is not proof of
  anything having been taken;
- a **confirmed planned bolus** (`USER_CONFIRMED`) records that the patient
  reviewed and accepted the calculation;
- an **administered dose** (`ADMINISTRATION_RECORDED`) is a separate,
  explicit, later action and may differ from the calculated amount - it is
  never used to overwrite the calculation.
