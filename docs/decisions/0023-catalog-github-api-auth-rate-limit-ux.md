# ADR-0023: Catalog GitHub API auth resolution and rate-limit UX

- **Status:** Accepted
- **Date:** 2026-08-05
- **Decided by:** Aniisa Bihi (draft by Cursor; design approved in session before implementation)
- **Affects:** `src/catalog/remote-catalog/github-auth.ts`, `github-rate-limit.ts`, `github-tree.ts`, `ref.ts`, `sync.ts`, `src/commands/update.ts`, `src/claude/setup-core.ts`
- **Related:** [PR #193](https://github.com/WeAreHausTech/haus-workflow/pull/193), [spec](../superpowers/specs/2026-08-05-github-rate-limit-ux-design.md)

## Context

Catalog sync lists trees and resolves release tags via the GitHub REST API. Without a
token, that API is capped at 60 requests/hour. When the limit is hit, tag resolution
fell back to a cached ref with a short warn, tree listing failed, and (with concurrency)
failed fetches were retried per item — producing dozens of `Failed to list files`
warnings and burning remaining quota, with no actionable fix. Many operators already
have `gh` authenticated; haus ignored that credential and used the unauthenticated
pool.

## Decision

1. **Auth precedence (once per process, never logged):**
   `HAUS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `gh auth token` (non-interactive, short
   timeout) → unauthenticated.
2. **Rate-limit detection:** treat GitHub API `403`/`429` with
   `X-RateLimit-Remaining: 0` or `Retry-After` as rate-limited; record
   `X-RateLimit-Reset` when present.
3. **Negative-cache tree listing for the sync** after a rate-limit failure so later
   items do not re-hit the API; suppress per-item list-file spam when rate-limited.
4. **Soft-continue sync** (partial cache OK). Surface **one** end-of-sync message via
   `SyncResult.rateLimit`: token-first fix when unauthenticated; wait-until-reset only
   when authenticated.

## Motivation (why)

- Prefer silent auth from env/`gh` over instructing users to export a token they
  already have.
- Waiting alone can re-exhaust the unauthenticated limit; token-first copy + stop
  retrying addresses root cause and the spam symptom.
- Hard-failing the whole `haus update` was rejected — partial cache and project
  refresh should still proceed.

## Alternatives considered

- **Messaging only (no negative-cache / no gh fallback).** Rejected: leaves the retry
  storm and unauth burn in place.
- **Hard-abort sync on rate limit.** Rejected: worse UX than soft-continue + clear fix.
- **`[adr-skip]` instead of an ADR.** Rejected: change defines catalog API credential
  resolution and failure UX; belongs in the decision log even though path heuristics
  are volume-triggered rather than `securityPathGlobs`.

## Consequences

- Catalog sync uses authenticated GitHub API when `gh` or an env token is available
  (5000 req/hr class limits instead of 60).
- Rate-limited runs print one fix block after the failed-item summary; operators are
  steered to token setup rather than silent partial failure.
- Tests inject a `gh` token resolver; production never logs token values.
