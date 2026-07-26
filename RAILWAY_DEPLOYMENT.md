# Railway deployment

## Architecture

One Node service serves **both** the API and the built PWA
(`APP_BUILD_PROMPT.md` section 19's simpler single-service option): the
Fastify app in `apps/api` optionally serves `apps/web/dist` as static files
with an SPA fallback (`registerStaticWebApp` in `apps/api/src/server.ts`),
auto-detected at startup when `apps/web/dist` exists alongside
`apps/api/dist` in the same checkout - no extra configuration is required
for this to work in a standard Railway build.

## Build and start

Configured in [`railway.json`](railway.json) and [`nixpacks.toml`](nixpacks.toml):

- **Build**: `npm ci && npm run build` - installs all workspace dependencies
  and builds every package/app (`packages/*` → `apps/api` → `apps/web`).
- **Start**: `npm run start` → `node apps/api/dist/src/server.js`. This is
  the production build's compiled server - the app is never started with a
  dev server (`tsx watch`) in production.
- `nixpacks.toml` pins `python3`, `gcc`, and `gnumake` in the build
  environment because `better-sqlite3` compiles a native addon during
  `npm ci`.

## The Australian food database in production

`data/australian_foods.sqlite` (13 MB) is committed to the repository (see
[`audit/SOURCE_HASHES.txt`](audit/SOURCE_HASHES.txt) for its
checksum) and is included in the Railway build context automatically - no
volume or release-step download is required at this size.

At startup, `apps/api/src/db.ts` opens the database **read-only**, computes
its SHA-256, and compares it against
`docs/data-source/australian_foods.sqlite.sha256`. If the file is missing,
corrupted, or the checksum does not match, the server logs a clear error and
**exits** rather than starting with unverified data.

## Environment variables

Set these in the Railway service's Variables tab (see
[`.env.example`](.env.example) for the full list):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` - required for production mode (durable
  Supabase-backed repositories + verified JWT auth). Without all four, the
  server logs a warning and falls back to in-memory dev repositories, which
  must never be used in production.
- `APP_ORIGIN` - set to the deployed public HTTPS URL (used for CORS).
- `NODE_ENV=production`.
- `PORT` - Railway sets this automatically; the server reads it.
- `DATABASE_PATH` / `STATIC_WEB_DIR` - normally auto-detected; only set
  explicitly if the deployment layout differs from the standard monorepo
  checkout.

Frontend build-time variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_API_BASE_URL`) must also be set before `npm run build` runs, since Vite
inlines them at build time. Set `VITE_API_BASE_URL=/api/v1` for the combined
single-service deployment (same-origin API calls).

## HTTPS, CORS, and headers

- Railway terminates TLS at the edge; the app only needs to trust
  `APP_ORIGIN` for CORS (`@fastify/cors`, configured in `server.ts`).
- The SPA fallback and static-asset cache headers are described in
  [`OFFLINE_BEHAVIOR.md`](OFFLINE_BEHAVIOR.md): `index.html` and the service
  worker are never cached; hashed `assets/*` files are cached
  long-term/immutable.

## Health check

`GET /api/v1/health` returns `{ status, mode, databaseSha256,
calculatorVersion }`. `railway.json` configures this as the deploy health
check path.

## Deployment steps (requires your action)

This environment cannot log in to Railway or connect a project on your
behalf. To deploy:

1. Push this repository to GitHub (see the Git section of the final
   report for the exact command once a remote is created).
2. In the Railway dashboard: **New Project → Deploy from GitHub repo**,
   select this repository.
3. Set the environment variables listed above in the service's Variables
   tab.
4. Trigger a deploy (Railway deploys automatically on push once connected).
5. Once live, run the smoke tests in
   [`audit/DEPLOYMENT_RECORD.md`](audit/DEPLOYMENT_RECORD.md)
   against the production URL.

I cannot complete steps 1-4 without your Railway/GitHub credentials - see the
final report for the exact single next action.
