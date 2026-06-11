# Plan: three-tier Claude Code permissions (deny + ask)

> Source: user permission-review spec (STRYK / DENY / ASK). STRYK = "remove from
> the deny list", not a new tier. Net result is two managed tiers: hard **deny**
> and new **ask**, plus a set of patterns dropped entirely.

## Target end-state

The two blocks below are the complete haus-managed output written into
`permissions.deny` / `permissions.ask` (per-tool granularity matters).

**DENY (hard, never auto):**

- Bash: `sudo`, `chmod -R 777`, `git push --force`, `drop database`,
  `truncate table`, `npm publish`, `yarn npm publish`, `pnpm publish`
- Read+Edit+Write: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`,
  `customer-data/**`, `secrets/**`, `certs/**`

**ASK (Claude prompts user):**

- Bash: `rm -rf`, `chown -R`, `git reset --hard`, `docker system prune`,
  `php artisan migrate --force`
- Edit+Write only: `.env`, `.env.*`, `storage/logs/**`, `exports/**`
- Read+Edit+Write: `*.dump`, `*.backup`, `*.bak`, `wp-content/uploads/**`, `uploads/**`

**Dropped entirely** (were deny, now in no tier): `*.sql` (all tools),
`.env` Read, `.env.*` Read, `storage/logs` Read, `exports` Read.

## Assumptions (no user objection required to proceed)

1. **Hook guards mirror the DENY tier only.** `guardBash`/`guardFileAccess`
   hard-block today; if they keep blocking ASK/dropped items the ask never
   prompts and `.env` stays unreadable. Guards narrow to deny-tier lists.
   All deny-tier paths block all three tools → `guardFileAccess` stays path-only.
2. **Scanner stays conservative.** `SENSITIVE_PATH_REGEXES` + the scanner's
   `blocked()` are unchanged. Bulk auto-scan still skips `.env`/`*.sql`/`exports`;
   STRYK only relaxes on-demand reads by Claude.
3. **Ships as the new haus default** for every `apply`/`update`/project-setup.

## Data-model change

Today the lists are flat strings denied uniformly across Read/Edit/Write.
The spec needs per-tool granularity + two tiers. New shapes:

- `dangerous-commands.ts`: `DENY_COMMANDS` (8) + `ASK_COMMANDS` (5).
- `sensitive-paths.ts`: replace flat `SENSITIVE_PATHS` (deny+guard consumer) with
  - `DENY_PATHS: string[]` — 9 patterns, all R+E+W (dirs recursive).
  - `ASK_PATHS: { pattern: string; tools: ('Read'|'Edit'|'Write')[] }[]` — 9 entries.
  - keep `DENY_DIRS`/dir set for `/**` expansion (customer-data, secrets, certs,
    storage/logs, wp-content/uploads, uploads, exports).
  - keep `SENSITIVE_PATH_REGEXES` + `SENSITIVE_ITEM_KEYWORDS` untouched (scanner/recommender).

## Tasks

### T1 — restructure source lists

- **Files:** `src/security/dangerous-commands.ts`, `src/security/sensitive-paths.ts`
- Split commands into DENY/ASK. Replace `SENSITIVE_PATHS` with `DENY_PATHS` +
  `ASK_PATHS` (typed). Keep regexes/keywords.
- **Acceptance:** typecheck passes; no consumer references stale `SENSITIVE_PATHS`.
- **Verify:** `yarn typecheck`

### T2 — narrow hook guards to deny tier

- **Files:** `src/security/guard-bash.ts`, `src/security/guard-file-access.ts`
- `guardBash` matches `DENY_COMMANDS`; `guardFileAccess` matches `DENY_PATHS`.
- **Acceptance:** `rm -rf`, `.env` Read no longer blocked by guard; `sudo`,
  `*.pem` still blocked.
- **Verify:** `tests/guard.test.js` (update expectations).

### T3 — build deny + ask rules

- **Files:** `src/security/deny-rules.ts`, new `src/security/ask-rules.ts`
- `buildDenyRules()`: `Bash(cmd:*)` per DENY_COMMANDS + `Read/Edit/Write(pattern)`
  per DENY_PATHS (dirs → `/**`).
- `buildAskRules()`: `Bash(cmd:*)` per ASK_COMMANDS + `<tool>(pattern)` per
  ASK_PATHS entry honoring its `tools` array (dirs → `/**`).
- **Acceptance:** outputs equal the two target blocks exactly (dedup, sorted-stable).
- **Verify:** `tests/deny-rules.test.js` + new `tests/ask-rules.test.js`.

### T4 — merge/unmerge ask rules

- **File:** `src/install/settings-merge.ts`
- Add `askRules?: string[]` to `_haus`. Add `mergeAskRules()` + `stripHausAsk()`
  mirroring deny. Update `mergeHooks`/`mergeDeny`/`mergeAllow`/strip\* to preserve
  `askRules` (order-independent), and include askRules in every `stillTracking`
  check.
- **Acceptance:** merge idempotent; strip removes only haus askRules.
- **Verify:** `tests/settings-merge` (add ask cases) + `install-roundtrip.test.js`.

### T5 — wire into install / project / canonical / uninstall

- **Files:** `src/install/apply.ts`, `src/claude/merge-project-settings.ts`,
  `src/claude/load-hooks.ts`, `src/install/uninstall.ts`, `src/commands/undo.ts`
- Call `mergeAskRules(..., buildAskRules())` alongside deny/allow.
- `load-hooks.ts`: `permissions: { deny: buildDenyRules(), ask: buildAskRules() }`.
- uninstall/undo: add `stripHausAsk(...)` to the strip chain.
- **Acceptance:** fresh install writes deny+ask; uninstall removes both, leaves
  user rules.
- **Verify:** `install-roundtrip.test.js`.

### T6 — docs + catalog template

- **Files:** `docs/security.md`, catalog
  `templates/agentic-workflow-standard.md:89-105` example block.
- Document the two-tier model + the guard-mirrors-deny invariant.
- **Acceptance:** docs match shipped output; template example block updated.
- **Verify:** manual read; `yarn verify`.

## Final gate

`yarn verify` (typecheck + lint + build + test) green. Code review (fresh
context) before merge. Squash-merge PR.

## Out of scope

Scanner regexes, recommender keywords, `npm`/`yarn`/`pnpm publish` tier change
(stay deny).
