# ADR-0009: llms.txt reference fetching and local cache

- **Status:** Accepted | **Date:** 2026-06-24

## Context

Catalog items carry a `references` field with llms.txt URLs (e.g.
`https://www.prisma.io/llms.txt`). These URLs were stored in the manifest but never
fetched — agents invoking those skills had no access to the upstream API docs the URLs
pointed to.

## Decision

Add a fetch-and-cache layer with etag-based conditional requests:

1. `src/refs/fetch-refs.ts` — fetches llms.txt URLs using `If-None-Match` /
   `If-Modified-Since`; a 304 skips the write. Failures are captured in a summary,
   never thrown.
2. Cache lives at `.haus-workflow/llms-cache/<slug>.md` with metadata in
   `cache-meta.json` (etag, lastModified, fetchedAt). gitignored via the existing
   `.haus-workflow/` rule.
3. `haus fetch-refs` — new CLI command; agents can refresh a single item with
   `--id <id>` or all items with `--all`.
4. `haus apply --write` auto-fetches all items' llms.txt refs as a best-effort
   post-step (failures warn, never abort apply).

Only `source: haus` skills get a `## Reference Documentation` section in their
SKILL.md. Curated upstream skills (`source: curated`) are excluded — those files
are overwritten by upstream sync.

## Consequences

- Agents reading an applied skill can follow the Reference Documentation section to
  get current upstream API docs in context — no manual step required after first
  `apply --write`.
- Etag caching means re-running `apply --write` or `fetch-refs` is cheap (304 = no
  re-download).
- Cache is project-local and gitignored — each developer fetches on first apply.

## Alternatives considered

- **Embed llms.txt content directly in SKILL.md** — rejected; content is too large,
  stales immediately, and belongs outside version control.
- **Fetch at recommend time** — rejected; recommend is a headless, deterministic
  classifier that must not make network calls.
- **Single shared global cache** — rejected; project-local cache avoids cross-project
  interference and is consistent with other `.haus-workflow/` artifacts.
