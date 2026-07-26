# Offline behaviour

The PWA is built with `vite-plugin-pwa` (`apps/web/vite.config.ts`).

## What is cached

- The app shell (JS/CSS/HTML/icons) is precached by the service worker so
  the installed app opens offline.
- `/api/v1/foods/search` and `/api/v1/bolus/*` are explicitly configured
  `NetworkOnly` - **never cached**, so a stale food search result or a stale
  bolus preview can never be served while offline or after reconnection.

## What is not shipped to the browser

The Australian food SQLite database is never sent to the browser - the
browser only ever calls the backend food-search API
(`APP_BUILD_PROMPT.md` section 12/13). No bounded local food index has been
built for this version.

## What is not yet implemented

This build's offline support currently covers only the installable app
shell. The following, described in `APP_BUILD_PROMPT.md` section 12, are
**not yet implemented** and are tracked as known limitations:

- a persistent local offline queue for non-clinical sync operations
  (`sync_metadata` table exists in the schema, but no client-side queue
  writes to it yet);
- retaining previously synced history locally for offline viewing;
- explicit "pending sync" UI state.

Because these are not yet implemented, the app currently **requires network
connectivity** for search, carbohydrate calculation, settings, and every
bolus operation - it fails visibly (a clear error banner) rather than
inventing a successful result when offline, which satisfies the
non-negotiable "never invent a successful confirmation" requirement even
without the full offline queue. See
[`audit/KNOWN_LIMITATIONS.md`](audit/KNOWN_LIMITATIONS.md).

## Authentication tokens

`@supabase/supabase-js` manages its own session storage; the app does not
add any additional client-side caching of tokens, and the service worker's
cache does not include API responses that could carry a token.
