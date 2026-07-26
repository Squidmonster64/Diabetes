# Local setup

Written for a non-technical or first-time operator. Every command below is
run from the repository root unless stated otherwise.

## 1. Prerequisites

- Node.js 20 or newer (`node -v`)
- npm 10 or newer (bundled with Node)

No other software is required to run the app locally without Supabase.

## 2. Install dependencies

```bash
npm install
```

This installs dependencies for every package (`packages/bolus`,
`packages/food-contracts`, `packages/shared-types`) and every app
(`apps/api`, `apps/web`), plus the Playwright e2e test harness
(`tests/e2e`).

## 3. Environment variables

Copy the example file and fill in values as needed:

```bash
cp .env.example .env
```

Without any Supabase variables set, `apps/api` runs in **development mode**:
it uses in-memory (non-durable) repositories and accepts an
`X-Dev-Patient-Id` header instead of a verified Supabase JWT. This is safe
for local development only - never deploy this mode to production. See
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) to connect a real project.

## 4. Run the app

```bash
npm run dev
```

This starts:

- the API on `http://localhost:8080`
- the web app on `http://localhost:5173` (Vite dev server, proxies `/api` to
  the API)

Open `http://localhost:5173` in a browser. Without Supabase configured, the
sign-in screen will attempt a real magic-link request and fail gracefully;
to exercise the app end-to-end without Supabase, use the API directly (see
below) or complete Supabase setup first.

### Exercising the API without a browser

```bash
curl http://localhost:8080/api/v1/health

curl "http://localhost:8080/api/v1/foods/search?q=Weet-Bix"

curl -X POST http://localhost:8080/api/v1/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Dev-Patient-Id: demo-patient' \
  -d '{
    "icr":"10","isf":"2","targetGlucose":"6","insulinDurationHours":"4",
    "doseIncrementUnits":"0.5","maximumDoseUnits":"20","lowGlucoseThreshold":"4",
    "glucoseUnit":"MMOL_L",
    "insulinDurationEntrySource":"PATIENT_ENTERED_FROM_CLINICIAN_REPORT",
    "insulinDurationPatientConfirmedAccurate":true
  }'
```

## 5. Run tests

```bash
npm run test        # unit + integration tests (bolus, food adapter, API)
npm run test:e2e     # Playwright black-box API tests
npm run typecheck    # TypeScript across every workspace
```

## 6. Build for production

```bash
npm run build
```

Builds every package and app. The API build output is `apps/api/dist`; the
web build output is `apps/web/dist` (a static PWA bundle).

## 7. Run the production build locally

```bash
DATABASE_PATH=./data/australian_foods.sqlite \
PORT=8080 \
NODE_ENV=production \
node apps/api/dist/src/server.js
```

Serve `apps/web/dist` with any static file server, or see
[`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md) for the combined
single-service deployment used in production.
