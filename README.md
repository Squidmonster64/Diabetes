# Diabetes Companion (Australian-first)

A mobile-first, installable Progressive Web App that looks up Australian food
carbohydrate values and runs a deterministic, rule-based bolus-calculator
preview from patient-entered clinician-report settings.

> **This is an engineering prototype. It is not approved for clinical
> treatment use.** It requires clinician review before any real-world use.
> See [`CLINICIAN_REVIEW.md`](CLINICIAN_REVIEW.md) and
> [`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).

**Live deployment**: https://diabetes-companion-app-production.up.railway.app
(see [`audit/DEPLOYMENT_RECORD.md`](audit/DEPLOYMENT_RECORD.md) for smoke-test
results; sign-in is not yet usable until Supabase's Auth URL Configuration is
set to this URL - see `SUPABASE_SETUP.md`).

## What this is

1. A patient searches for an Australian food (AUSNUT 2023 / AFCD Release 3).
2. The app calculates carbohydrate grams from a selected portion.
3. The patient enters current glucose and active-insulin declarations.
4. A deterministic bolus module ([`packages/bolus`](packages/bolus)) runs every
   safety gate from `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` and returns a
   preview or a refusal - never a hidden or capped dose.
5. The patient explicitly reviews and confirms (or rejects) the preview.
6. Only a confirmed result is recorded as a confirmed bolus event.

## Repository layout

```text
apps/
  web/            React + Vite PWA (mobile-first UI, 20 screens)
  api/            Fastify API: food adapter, bolus routes, auth, repositories

packages/
  bolus/          Framework-independent deterministic bolus calculator
  food-contracts/ Neutral food-module result contracts (the bolus/food boundary)
  shared-types/   Small cross-cutting types

data/
  australian_foods.sqlite   Read-only AUSNUT 2023 + AFCD Release 3 database

supabase/
  migrations/     SQL migrations with Row Level Security policies

docs/             Architecture, clinical, data-source and audit documentation
tests/
  e2e/            Playwright black-box API tests for critical flows
```

## Quick start

```bash
npm install
npm run dev        # starts apps/api on :8080 and apps/web on :5173
```

See [`LOCAL_SETUP.md`](LOCAL_SETUP.md) for full beginner-friendly instructions,
environment variables, and how to run without Supabase configured.

## Commands

```bash
npm install        # install all workspace dependencies
npm run dev         # run API + web dev servers
npm run test         # run bolus, food and API test suites
npm run test:e2e     # run Playwright black-box API tests
npm run build         # production build of every package/app
npm run start          # run the built API (serves the API only; see RAILWAY_DEPLOYMENT.md)
npm run lint            # currently aliased to typecheck (see TROUBLESHOOTING.md)
npm run typecheck        # TypeScript --noEmit across every workspace
npm run audit              # regenerate the audit package under audit/
```

## Documentation index

- [`LOCAL_SETUP.md`](LOCAL_SETUP.md) - run everything locally
- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) - auth, migrations, RLS
- [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md) - production deployment
- [`DATA_MODEL.md`](DATA_MODEL.md) - Supabase schema and relationships
- [`API_CONTRACT.md`](API_CONTRACT.md) - HTTP API reference
- [`FOOD_ADAPTER.md`](FOOD_ADAPTER.md) - Australian food database adapter
- [`BOLUS_MODULE.md`](BOLUS_MODULE.md) - the deterministic calculator
- [`SAFETY_MODEL.md`](SAFETY_MODEL.md) - safety gates and refusal behaviour
- [`PRIVACY_MODEL.md`](PRIVACY_MODEL.md) - logging and data minimisation
- [`OFFLINE_BEHAVIOR.md`](OFFLINE_BEHAVIOR.md) - PWA offline behaviour
- [`CLINICIAN_REVIEW.md`](CLINICIAN_REVIEW.md) - clinical review status
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) - common problems

## Clinical and safety boundaries

The bolus module never derives, recommends, or adjusts clinical settings; it
performs arithmetic only, on values the patient transcribes from their
current clinician-approved plan. See
[`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`](BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md)
for the full specification this module implements.
