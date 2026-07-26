# Troubleshooting

## "Australian food database not found" / checksum mismatch at startup

The server refuses to start if `data/australian_foods.sqlite` is missing,
fails `pragma integrity_check`, or its SHA-256 does not match
`docs/data-source/australian_foods.sqlite.sha256`. This is intentional
(`APP_BUILD_PROMPT.md` section 19: "fail startup clearly if the database is
missing or corrupted"). Fix: confirm the file exists at `DATABASE_PATH` (or
let it auto-detect - see `apps/api/src/config.ts`) and has not been modified.

## `npm run dev` web app can't reach the API / CORS errors

Confirm `apps/api` is running on the port the Vite proxy expects (`8080` by
default - see `apps/web/vite.config.ts`'s `server.proxy`), and that
`APP_ORIGIN` in the API's environment matches the web app's origin exactly
(including protocol and port).

## Sign-in screen sends a magic link but nothing arrives

Supabase is either not configured (`VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY` unset - the client falls back to placeholder
values that cannot succeed) or the Site URL / redirect URLs in the Supabase
dashboard do not match your app's origin. See
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) section 3.

## API returns `401 UNAUTHENTICATED` for every request in development

Development mode (no Supabase env vars set) expects an `X-Dev-Patient-Id`
header instead of a Supabase bearer token. This fallback is refused outright
when `NODE_ENV=production` - see `apps/api/src/auth/requireAuth.ts`.

## `NO_ACTIVE_CONFIGURATION` refusal on every bolus preview

The authenticated patient has no `ACTIVE` settings version yet. Create one
via `POST /api/v1/settings` (or the Settings screen) before calculating.

## Integration/e2e tests seem slow

`apps/api`'s test suite opens the 13 MB SQLite database and runs a full
`pragma integrity_check` once per test file (`beforeAll`), which is
I/O-bound; a full `npm run test` run typically takes 30-80 seconds depending
on disk cache state. `apps/api/vitest.config.ts` runs test files
sequentially in a single fork specifically to avoid the read-contention
slowdown seen when multiple test files each open the database concurrently.

## `npm run lint` doesn't look like a real linter

Correct - it is currently aliased to `npm run typecheck`. No ESLint
configuration has been added yet; TypeScript's `--noEmit --strict` check is
the current gate. See
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).

## Playwright e2e tests can't launch a browser

`npx playwright install chromium` reports "Playwright does not support
chromium on mac13" on some hosts. This doesn't block `tests/e2e`: those
tests use Playwright's `request` API-testing fixture only, which needs no
browser binary. True browser-DOM e2e tests are not implemented yet - see
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md) for why.

## `better-sqlite3` fails to install/build

It compiles a native addon via `node-gyp` and needs `python3` and a C/C++
toolchain. Locally, install Xcode Command Line Tools (`xcode-select
--install` on macOS) or your platform's build-essential package. In
Railway, `nixpacks.toml` pins `python3`, `gcc`, and `gnumake` explicitly for
this reason.
