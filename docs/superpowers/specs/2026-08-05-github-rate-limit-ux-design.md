# GitHub API rate-limit UX + gh auth fallback

**Date:** 2026-08-05  
**Status:** Approved  
**Repo:** haus-workflow (CLI)

## Problem

`haus update` / catalog sync call the unauthenticated GitHub API (60 req/hr). When the limit is hit:

1. Tag resolution falls back silently to a cached ref (“Tag resolution failed…”).
2. Recursive tree listing fails; with concurrency 8, failed tree fetches are **not** negative-cached, so later items **retry** the API and burn remaining quota.
3. Users see ~98× `Failed to list files for …` with no actionable fix.
4. Waiting until reset works for **one** healthy sync (~3 API calls: tags + commit + tree), but unauthenticated use is fragile; many users already have `gh` authenticated and haus never uses that token.

## Goals

- Prefer authenticated GitHub API when a token is available (env or `gh`).
- On rate limit: stop retrying within the same sync; surface **one** clear end-of-sync fix message.
- Token-first guidance; wait-until-reset secondary.
- Soft-continue sync (partial cache / existing behavior) — do not hard-fail the whole command.

## Non-goals

- Hard-aborting `haus update` on rate limit.
- Changing catalog fetch transport (still raw.githubusercontent + GitHub API tree).
- Documenting a full runbook page in this change (optional one-liner later).

## Design

### 1. Auth resolution (once per process)

Precedence for API `Authorization` header:

1. `HAUS_GITHUB_TOKEN` if set and non-empty
2. Else `GITHUB_TOKEN` if set and non-empty
3. Else `gh auth token` via existing `runCommand` (`src/utils/exec.ts`): short timeout (~2s), never interactive; empty stdout or non-zero exit → treat as missing
4. Else unauthenticated

Cache resolved token (including “none”) for the process. Never log the token value.

Wire through `githubApiHeaders()` in `src/catalog/remote-catalog/ref.ts` (async resolve or sync cache populated before first API call).

### 2. Rate-limit detection

On GitHub API responses used for tag listing and tree listing:

- Treat as rate-limited when status is `403` or `429` **and** either `X-RateLimit-Remaining` is `0` or `Retry-After` is present (and/or body indicates rate limit).
- Capture `X-RateLimit-Reset` (unix seconds) when present → `resetAt`.
- Other non-OK responses remain soft failures (null) without setting rate-limit state.

### 3. Stop retry (negative cache)

In `src/catalog/remote-catalog/github-tree.ts`:

- When tree listing fails due to rate limit, mark a per-sync sentinel so subsequent `fetchCatalogBlobPaths` / `listFilesUnderCatalogPrefix` return `null` **without** further API calls.
- When rate-limited, do **not** emit per-item `Failed to list files for ${id}` spam; emit at most one short warn (optional) and still count items as `failed` in `SyncResult`.
- Reset sentinel at start of each `syncRemoteCatalog` (existing `_resetBlobPathCacheForNewSync`).

Tag resolution keeps today’s short warn (`Tag resolution failed — using cached ref…`) when fallback is used; if the failure was rate-limit, set the same rate-limit flag for end-of-sync messaging.

### 4. SyncResult extension

```ts
export type SyncResult = {
  newItems: string[]
  refreshed: string[]
  unchanged: number
  failed: string[]
  /** Set when any GitHub API call in this sync hit rate limit. */
  rateLimit?: {
    resetAt: number | null // unix seconds from X-RateLimit-Reset
    authenticated: boolean // whether a token was used for API calls
  }
}
```

### 5. User-facing message (once, sync end)

Callers that already summarize sync (`src/commands/update.ts`, `src/claude/setup-core.ts`) print **one** block after the existing `Failed to fetch N item(s)` warn when `sync.rateLimit` is set.

**Unauthenticated** (`authenticated: false`):

```
GitHub API rate limit exceeded (unauthenticated: 60 req/hr).
Fix:  export GITHUB_TOKEN=$(gh auth token)   # or HAUS_GITHUB_TOKEN=<pat>
      # also: gh auth login   if gh isn't logged in
Then: retry the command (e.g. haus update)
Or wait until <local reset time> and retry once (token still recommended — wait alone can re-hit the limit).
```

**Authenticated** (`authenticated: true`): do not tell the user to export a token; tell them to wait until `<local reset time>` (authenticated limits are higher; still time-bounded).

Shared helper for copy + formatting reset time (e.g. `src/catalog/remote-catalog/rate-limit-message.ts` or under `src/utils/`).

### 6. Testing

- Env token wins over `gh`.
- Empty env → `gh auth token` success supplies Authorization.
- `gh` missing / non-zero → unauthenticated headers.
- Mock API 403 + `X-RateLimit-Remaining: 0` → single tree attempt, many items `failed`, `rateLimit` set, no N+1 tree API calls.
- Message helper: unauthenticated vs authenticated copy; reset formatting when `resetAt` null vs set.
- Non-rate-limit tree failure → no `rateLimit`; existing per-item warns unchanged.

## Acceptance

- With `gh` logged in and no env token, catalog sync uses authenticated API (no unauth 60/hr burn from haus alone).
- When rate-limited without a token: one fix block; no 98× list-file spam; no retry storm.
- When rate-limited with a token: wait message only; sync still soft-continues.
- `yarn verify` green; regression tests for auth order + rate-limit negative cache.

## Implementation notes

- Prefer small modules: auth resolve, rate-limit state, message formatter, wire into existing sync/update/setup paths.
- Do not change raw content fetch (raw.githubusercontent.com) auth model in this work unless already required for private catalogs (out of scope; catalog is public).
