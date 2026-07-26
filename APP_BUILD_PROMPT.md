# Claude Code Build Prompt — Australian Diabetes Companion PWA

Build, test, audit, and deploy the Australian-first Diabetes Companion PWA in this repository.

Work autonomously through implementation and deployment. Do not pause between phases unless blocked by a credential, an external account action, a missing required file, or a clinical specification conflict that cannot safely be resolved.

Do not modify any source project outside this repository.

---

## 1. Required local inputs

Inspect this repository before writing code.

Required files:

- `data/australian_foods.sqlite`
- `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`

Also inspect, if present:

- `docs/data-source/`
- `vendor/`
- `APP_BUILD_INSTRUCTIONS.md`

Do not assume access to any previous ChatGPT or Claude conversation. Treat the local files as the source of truth.

Calculate and record SHA-256 hashes for:

- the Australian SQLite database;
- the bolus-calculator handoff specification;
- all imported or reconstructed bolus source files.

---

## 2. Product objective

Build a mobile-first, installable Progressive Web App for iPhone supporting this workflow:

1. User signs in.
2. User searches for an Australian food.
3. The app displays ranked AUSNUT and AFCD matches.
4. The user selects a food.
5. The user selects an available household measure or enters grams or millilitres.
6. The app deterministically calculates carbohydrate grams.
7. The user enters current glucose, glucose timestamp, and active insulin where applicable.
8. The app loads patient-entered settings copied from the patient’s current clinician report or treatment plan.
9. The deterministic bolus module runs all required safety gates.
10. The app displays a bolus preview.
11. The user explicitly confirms or rejects the preview.
12. Only a confirmed result is recorded as a confirmed bolus event.
13. The user can review history, settings provenance, calculation details, and food-data provenance.

Initial acceptance workflow:

`Search “Weet-Bix” → choose food → select biscuits or enter grams → calculate carbohydrate grams → enter glucose and active insulin → receive safety-gated deterministic preview → explicitly confirm → save confirmed event → view it in history`

---

## 3. Non-negotiable clinical boundaries

Implement the bolus calculator exactly from `BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`.

Do not redesign, simplify, reinterpret, or extend the clinical logic.

Do not:

- derive an insulin-to-carbohydrate ratio;
- derive an insulin sensitivity factor;
- derive a target glucose;
- derive insulin duration;
- recommend treatment settings;
- optimise treatment settings;
- automatically adjust settings;
- create treatment plans;
- use machine learning for dose calculation;
- use generative AI for dose arithmetic;
- allow conversational text to alter a calculated dose;
- bypass any safety gate;
- treat food-search confidence as dose confidence;
- save a preview as a confirmed dose;
- silently choose between conflicting clinical rules.

The calculator must be deterministic and testable.

Conversational or dictated input may assist with extracting food-search terms, but it must never calculate, modify, round, approve, or confirm a bolus.

---

## 4. Patient-entered clinician-report settings

The following values are entered by the patient as transcriptions from a current clinician-approved report or treatment plan:

- insulin-to-carbohydrate ratio;
- insulin sensitivity factor;
- target glucose;
- insulin duration;
- dose increment;
- maximum dose;
- low-glucose threshold;
- glucose units.

Do not label these as clinician-entered unless the interface explicitly supports a clinician account.

Use wording such as:

> Patient-entered value copied from a clinician-approved report or treatment plan.

For every settings version, store:

- value;
- unit;
- enteredBy;
- sourceType;
- sourceDate;
- optional clinicianOrService;
- confirmedAccurate;
- enteredAt;
- supersededAt where applicable;
- version number;
- immutable audit identifier.

Require explicit confirmation that the entered values match the patient’s current clinician-approved plan.

A change must create a new settings version. Do not overwrite historical settings.

Incomplete, invalid, expired where specified by the handoff, or unconfirmed settings must block calculation.

The app must never suggest what values the patient should enter.

---

## 5. Architecture

Use a clear monorepo-style structure unless the existing scaffold already provides an equivalent clean structure.

Recommended layout:

```text
apps/
  web/
  api/

packages/
  bolus/
  food-contracts/
  shared-types/

data/
  australian_foods.sqlite

docs/
  architecture/
  clinical/
  data-source/
  audit/

tests/
  integration/
  e2e/
```

Use TypeScript throughout unless the local handoff mandates another language for the bolus module.

Preferred stack:

### Frontend

- React;
- Vite;
- TypeScript;
- mobile-first CSS;
- installable PWA;
- service worker;
- local offline queue;
- accessible controls;
- no browser microphone dependency.

### Backend

- Node.js;
- TypeScript;
- Fastify or Express;
- read-only access to the Australian SQLite food database;
- Supabase for authentication, user-owned records, settings versions, history, and sync;
- Railway deployment.

### Testing

- Vitest or equivalent;
- integration tests;
- Playwright for critical user flows where practical.

Do not expose the SQLite database directly to the browser.

The browser must query the backend food-search API.

Open the Australian SQLite database in read-only mode at runtime.

Do not write user data into the Australian SQLite file.

---

## 6. Module boundaries

### Food module

Responsibilities:

- search Australian food data;
- rank food matches;
- identify AUSNUT or AFCD provenance;
- retrieve household measures;
- calculate quantity in grams or millilitres;
- calculate carbohydrate grams;
- return food-data provenance.

The food module must return a neutral result contract similar to:

```json
{
  "sourceDataset": "AUSNUT_2023",
  "sourceFoodId": "source identifier",
  "foodName": "food name",
  "brand": null,
  "portionDescription": "1 medium",
  "portionQuantity": 1,
  "portionGrams": 150,
  "portionMillilitres": null,
  "carbohydrateGrams": 18.4,
  "carbohydrateDefinition": "available_carbohydrate_without_sugar_alcohols",
  "provenance": {
    "database": "australian_foods.sqlite",
    "sourceObject": "app_ausnut_measures",
    "databaseSha256": "..."
  }
}
```

The exact carbohydrate field and definition must be derived from the application-facing database views and documented.

Do not substitute total carbohydrate for available carbohydrate without an explicit documented rule from the source data or handoff.

### Bolus module

Responsibilities:

- validate patient-entered clinician-report settings;
- validate calculation inputs;
- calculate meal component;
- calculate correction component;
- subtract active insulin as specified;
- calculate unrounded total;
- round to configured dose increment;
- enforce maximum-dose behaviour;
- execute every safety gate;
- return structured success, warning, or refusal results;
- generate a deterministic calculation trace;
- support confirmation and rejection contracts;
- generate audit-safe log events.

The bolus module must receive numeric carbohydrate grams.

It must not know about:

- food names;
- food search;
- AUSNUT;
- AFCD;
- brands;
- household measures;
- natural-language input.

### Application module

Responsibilities:

- screens;
- navigation;
- state;
- authentication;
- orchestration;
- offline queue;
- explicit confirmation;
- history;
- settings entry;
- provenance display;
- error handling.

---

## 7. Australian food database

Inspect these objects where present:

- `app_ausnut_foods`;
- `app_afcd_foods_per_100g`;
- `app_afcd_liquids_per_100ml`;
- `app_australian_food_search`;
- `app_ausnut_measures`;
- `app_carbohydrate_calculator_input`;
- `app_food_search_fts`.

Document the actual schema before writing the adapter.

Implement:

- ranked search;
- exact-name boost;
- prefix boost;
- whole-word boost;
- token matching;
- sensible fallback matching;
- source filtering;
- pagination;
- measure lookup;
- gram-based calculation;
- millilitre-based calculation where supported;
- provenance details.

Add regression tests for at least:

- Weet-Bix;
- apple;
- an AFCD solid food;
- an AFCD liquid;
- an AUSNUT household measure;
- no-result search;
- malformed query;
- zero quantity;
- negative quantity;
- very large quantity.

Avoid the earlier apple/cider ranking problem. Exact and whole-word matches must outrank substring-only matches.

---

## 8. Bolus implementation

Reconstruct or import the bolus module from the handoff.

Preserve all formulas, result contracts, refusal codes, warning codes, confirmation rules, logging rules, versioning rules, and tests from the completed six stages.

At minimum, the implementation must include:

- `validateSettings`;
- `calculateMealBolus`;
- `calculateCorrectionBolus`;
- `calculateBolusPreview`;
- `runSafetyGates`;
- `confirmBolus`;
- `rejectBolusPreview`;
- `logConfirmedBolus`.

Use decimal-safe arithmetic where necessary.

Do not rely on uncontrolled floating-point behaviour for dose increments.

Ensure repeated calls with identical inputs and versioned settings produce identical outputs.

Record:

- calculator version;
- settings version;
- request identifier;
- preview identifier;
- calculation timestamp;
- calculation trace;
- warnings;
- refusal codes;
- confirmation status.

A preview must expire according to the handoff specification.

Confirmation must be idempotent.

A repeated confirmation request must not create duplicate dose records.

If the handoff contains conflicting rules, stop and report the exact conflict. Do not silently choose one.

---

## 9. Required safety behaviour

Implement every safety gate from the handoff in the specified order.

At minimum verify coverage for:

- missing settings;
- unconfirmed settings;
- invalid settings;
- invalid glucose units;
- missing current glucose;
- ambiguous current glucose;
- stale glucose;
- low glucose;
- invalid carbohydrate amount;
- invalid active insulin;
- unavailable recent-insulin history where correction dosing requires it;
- maximum dose;
- severe illness;
- vomiting;
- ketones;
- unconsciousness;
- severe hypoglycaemia;
- paediatric use not explicitly configured;
- pregnancy use not explicitly configured;
- concentrated-insulin ambiguity;
- expired preview;
- duplicate confirmation;
- logging failure.

User-facing emergency text must be cautious and must not imply that the app replaces emergency services or clinical advice.

Do not invent clinical thresholds not present in the handoff.

---

## 10. Screens

Implement these screens:

1. Authentication.
2. Home.
3. Food search.
4. Food results.
5. Food details and provenance.
6. Portion selection.
7. Carbohydrate summary.
8. Glucose and active-insulin entry.
9. Bolus preview.
10. Safety warning.
11. Safety refusal.
12. Confirmation.
13. Confirmation result.
14. History.
15. History event details.
16. Patient-entered clinician-report settings.
17. Settings confirmation.
18. Settings version history.
19. Data provenance.
20. About, safety, and limitations.

The primary workflow must be usable with one hand on an iPhone.

Use:

- large tap targets;
- readable type;
- clear hierarchy;
- explicit units;
- visible timestamps;
- clear back navigation;
- no hidden dose-changing gestures;
- no preselected confirmation;
- no dark-pattern confirmation controls.

The confirm button must clearly state that the user is recording the displayed result.

---

## 11. Authentication and data model

Use Supabase authentication.

Prefer magic-link or email one-time-password login unless an existing project standard dictates otherwise.

Create SQL migrations for:

- user profile;
- settings versions;
- calculation requests;
- calculation previews;
- refusal events;
- warning events;
- confirmation events;
- rejected previews;
- confirmed bolus logs;
- audit events;
- sync metadata.

Every user-owned table must include the authenticated user identifier.

Implement Row Level Security so users can access only their own records.

Do not use a service-role key in the browser.

Use environment variables.

Create `.env.example` with names only, no secret values.

Likely variables:

### Frontend

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_ANON_KEY`;
- `VITE_API_BASE_URL`.

### Backend

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY` or server-appropriate verified-token configuration;
- `DATABASE_PATH`;
- `PORT`;
- `APP_ORIGIN`;
- `NODE_ENV`.

Use Supabase JWT verification on the API.

Do not trust a user ID supplied in request JSON.

---

## 12. Offline behaviour

The installed PWA should:

- load the application shell offline;
- retain the current unconfirmed workflow locally;
- retain previously synced user history locally where appropriate;
- queue non-clinical sync operations safely;
- never invent a successful confirmation when the server has not accepted it;
- clearly show pending sync state;
- prevent duplicate submission after reconnection;
- avoid caching secrets;
- avoid caching authentication tokens in unsafe stores.

Food search may remain server-dependent unless a safe bounded local index is intentionally created.

Do not ship the full Australian SQLite database to the browser unless there is a justified and documented design decision.

---

## 13. API

Implement versioned API routes, for example:

```text
GET  /api/v1/health
GET  /api/v1/foods/search
GET  /api/v1/foods/:sourceDataset/:sourceFoodId
GET  /api/v1/foods/:sourceDataset/:sourceFoodId/measures
POST /api/v1/foods/calculate-carbohydrate

GET  /api/v1/settings/current
POST /api/v1/settings
GET  /api/v1/settings/history

POST /api/v1/bolus/preview
POST /api/v1/bolus/previews/:previewId/confirm
POST /api/v1/bolus/previews/:previewId/reject

GET  /api/v1/history
GET  /api/v1/history/:eventId
```

All calculation endpoints must use the deterministic bolus package.

Return structured error contracts.

Validate all input at the API boundary.

Add request identifiers and structured logs.

Do not log authentication tokens or unnecessary health information.

---

## 14. Privacy and logging

Minimise stored data.

Do not log raw access tokens.

Do not log secrets.

Do not place sensitive user data in URLs.

Do not send health data to analytics services.

Use structured application logs with redaction.

Separate:

- operational logs;
- clinical calculation audit events;
- user-visible history.

Record enough information to reproduce a confirmed calculation, including the exact settings version and calculator version.

Do not store an implied administered insulin dose unless the user explicitly confirms that field separately.

Distinguish clearly between:

- calculated preview;
- confirmed planned bolus;
- actual administered dose, if later supported.

For this initial version, use the handoff terminology exactly.

---

## 15. Tests

Create and run the following tests.

### Unit tests — food

- search ranking;
- exact versus substring ranking;
- measure conversion;
- per-100g carbohydrate calculation;
- per-100mL calculation;
- quantity validation;
- provenance.

### Unit tests — bolus

- every handoff test;
- every safety gate;
- rounding;
- maximum dose;
- deterministic repeatability;
- settings-version behaviour;
- preview expiry;
- duplicate-confirmation protection.

### Integration tests

- food selection to carbohydrate calculation;
- carbohydrate result to bolus preview;
- refusal path;
- warning path;
- confirmation path;
- rejection path;
- settings creation and versioning;
- authenticated history access;
- RLS assumptions;
- logging-failure handling.

### End-to-end tests

At minimum:

1. Weet-Bix end-to-end success path.
2. Low-glucose refusal.
3. Stale-glucose refusal.
4. Missing-settings refusal.
5. Active-insulin scenario.
6. Settings update creates a new version.
7. Duplicate confirmation does not duplicate history.
8. One user cannot access another user’s records.

Do not mark tests as passed without running them.

Do not delete or weaken failing tests merely to achieve a green build.

---

## 16. Development and production scripts

Provide simple commands:

```bash
npm install
npm run dev
npm run test
npm run test:e2e
npm run build
npm run start
npm run lint
npm run typecheck
npm run audit
```

Use a root `package.json` with workspace scripts where appropriate.

Create a README with exact beginner-friendly commands.

---

## 17. Git and repository setup

If this folder is not already a Git repository:

- initialise Git;
- create an appropriate `.gitignore`;
- exclude secrets;
- exclude temporary databases;
- include the required production SQLite database only if its size is acceptable for GitHub and deployment;
- otherwise use an explicit deployment-download or Railway-volume strategy.

Before committing, check the database size.

If it is too large for GitHub, do not attempt to push it blindly.

Instead:

- document its size;
- package it safely for deployment;
- use a Railway volume, release step, or another deterministic deployment mechanism;
- verify the deployed checksum.

Create logical commits.

Do not rewrite or delete unrelated history.

If no GitHub remote exists, stop only when the remote repository name or authentication is required, and provide the exact command the user must run.

If a remote already exists, push the completed branch.

---

## 18. Supabase setup

Create:

- SQL migration files;
- Row Level Security policies;
- seed data only for non-clinical development fixtures;
- setup instructions;
- environment-variable instructions;
- authentication callback configuration instructions.

Use migrations as the source of truth.

If the Supabase CLI is available and authenticated, apply migrations.

If credentials or project selection are required, stop and provide one exact user action at a time.

After the user completes the action, continue automatically.

Never place a service-role secret into the frontend.

---

## 19. Railway deployment

Deploy the backend and PWA to Railway.

Preferred approach:

- one Railway project;
- separate web and API services if the architecture requires it;
- or one Node service that serves the built PWA and API if this is simpler and secure.

Ensure the production service can access:

`data/australian_foods.sqlite`

Use an absolute runtime path derived from configuration.

Verify that the file exists in the production image or mounted volume.

Verify its SHA-256 checksum on startup.

Fail startup clearly if the database is missing or corrupted.

Configure:

- health check;
- production start command;
- environment variables;
- CORS;
- HTTPS origin;
- SPA fallback;
- service-worker headers;
- cache headers;
- SQLite read-only permissions.

Do not deploy using the development server.

If Railway authentication, project creation, GitHub connection, environment variables, or domain approval require user interaction, stop and give exactly one concrete action.

Continue when the user confirms completion.

After deployment, run production smoke tests against the Railway URL.

---

## 20. Deployment validation

Verify in production:

- health endpoint;
- PWA loads;
- manifest loads;
- service worker registers;
- authentication starts correctly;
- food search returns Weet-Bix;
- apple ranks appropriately;
- measure lookup works;
- carbohydrate calculation works;
- bolus preview uses the deterministic module;
- refusal gates work;
- confirmation creates one record only;
- history loads;
- settings versioning works;
- unauthenticated access is blocked;
- user isolation works;
- SQLite checksum matches the local source.

Do not enter real patient data during deployment validation.

Use clearly labelled synthetic test data.

---

## 21. Audit package

Create:

```text
audit/
  BUILD_MANIFEST.md
  SOURCE_HASHES.txt
  TEST_RESULTS.md
  SAFETY_GATE_COVERAGE.md
  CALCULATOR_TRACE_EXAMPLES.md
  FOOD_DATA_PROVENANCE.md
  SETTINGS_PROVENANCE.md
  RLS_REVIEW.md
  DEPLOYMENT_RECORD.md
  CLINICIAN_REVIEW_CHECKLIST.md
  KNOWN_LIMITATIONS.md
  SBOM.json
  RELEASE_CHECKLIST.md
```

Include:

- commit hash;
- build timestamp;
- dependency versions;
- calculator version;
- database checksum;
- handoff checksum;
- test commands;
- test results;
- safety-gate mapping;
- production URL;
- Railway deployment identifier where available;
- Supabase migration state;
- known limitations;
- unresolved risks.

Do not claim clinical approval.

Label the build as requiring clinician review before real-world use.

---

## 22. Documentation

Create:

- `README.md`;
- `LOCAL_SETUP.md`;
- `SUPABASE_SETUP.md`;
- `RAILWAY_DEPLOYMENT.md`;
- `DATA_MODEL.md`;
- `API_CONTRACT.md`;
- `FOOD_ADAPTER.md`;
- `BOLUS_MODULE.md`;
- `SAFETY_MODEL.md`;
- `PRIVACY_MODEL.md`;
- `OFFLINE_BEHAVIOR.md`;
- `CLINICIAN_REVIEW.md`;
- `TROUBLESHOOTING.md`.

Write instructions for a nontechnical owner.

---

## 23. Final completion report

At the end, report:

- local project path;
- architecture used;
- production URL;
- GitHub repository and branch;
- Supabase migration status;
- Australian database checksum;
- bolus handoff checksum;
- number of tests passed and failed;
- PWA install status;
- safety gates implemented;
- confirmation behaviour;
- settings-version behaviour;
- offline behaviour;
- remaining manual actions;
- unresolved clinical or technical risks;
- exact commands to restart, test, and redeploy.

Do not say the app is complete unless:

- the production build succeeds;
- tests have been run;
- the Railway deployment is reachable;
- the production database checksum is verified;
- the main Weet-Bix workflow has been smoke-tested;
- critical safety refusals have been smoke-tested.

Begin by inspecting and inventorying the repository and handoff package. Produce a brief implementation plan, then proceed.
