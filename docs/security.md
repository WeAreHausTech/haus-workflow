# Security

Defense in depth across three timings: **deterministic** `permissions.deny` / `permissions.ask`
(PreToolUse, before the model sees the call), **dynamic** PreToolUse guard hooks (real-time
backstop for the deny tier only), and **commit-time** secret scanning (Lefthook + gitleaks).

## Deterministic deny and ask rules

`haus install` / `apply` writes two managed permission arrays into `settings.json`:

- **`permissions.deny`** — hard block, Claude Code rejects automatically.
  Derived from `DENY_COMMANDS` + `DENY_PATHS` (`src/security/deny-rules.ts → buildDenyRules()`).
- **`permissions.ask`** — Claude must ask the user before proceeding.
  Derived from `ASK_COMMANDS` + `ASK_PATHS` (`src/security/ask-rules.ts → buildAskRules()`).
  Per-tool granularity: e.g. `.env` Read is unrestricted, Edit/Write require a prompt.

Both are tracked under `_haus.denyRules` / `_haus.askRules` and stripped on uninstall,
leaving user-defined rules intact. A scoped `permissions.allow` (e.g. `Bash(haus doctor:*)`)
pre-approves only haus's own subcommands so non-developers aren't prompted on every step.

**Invariant:** the hook-time guards mirror only the DENY tier. If a guard blocked ask-tier
items, `permissions.ask` would never prompt — the guard fires first. This invariant must be
preserved when editing the command/path lists.

## Guardrails (PreToolUse hooks)

- `guard file-access` hard-blocks **deny-tier** path access (`DENY_PATHS`)
- `guard bash` hard-blocks **deny-tier** bash command tokens (`DENY_COMMANDS`)
- Ask-tier items pass the guard and are gated by `permissions.ask` in settings.json
- Both guards return explicit, plain-language deny reasons (that still name the blocked
  command/path) — non-developers hit these and must understand them

### Deny-tier bash commands (hard block)

`src/security/dangerous-commands.ts` `DENY_COMMANDS`: `sudo`, `chmod -R 777`,
`git push --force`, `drop database`, `truncate table`, `npm publish`, `yarn npm publish`,
`pnpm publish`.

### Ask-tier bash commands (user prompt)

`src/security/dangerous-commands.ts` `ASK_COMMANDS`: `rm -rf`, `chown -R`,
`git reset --hard`, `docker system prune`, `php artisan migrate --force`.

### Deny-tier path patterns (hard block, all tools)

`src/security/sensitive-paths.ts` `DENY_PATHS`: `*.pem`, `*.key`, `*.p12`, `*.pfx`,
`id_rsa`, `id_ed25519`, `customer-data`, `secrets`, `certs`. The directory tokens
(`customer-data`, `secrets`, `certs` — listed in `DENY_DIRS`) are expanded to
`<dir>/**` when `buildDenyRules()` builds the rule strings.

### Ask-tier path patterns (user prompt, per-tool)

`src/security/sensitive-paths.ts` `ASK_PATHS`:

| Pattern                               | Tools requiring prompt |
| ------------------------------------- | ---------------------- |
| `.env`, `.env.*`                      | Edit, Write            |
| `storage/logs/**`, `exports/**`       | Edit, Write            |
| `*.dump`, `*.backup`, `*.bak`         | Read, Edit, Write      |
| `wp-content/uploads/**`, `uploads/**` | Read, Edit, Write      |

---

## Sensitive data handling

- Scanner excludes sensitive paths from scan set
- Security policy lines in `.claude/rules/haus.md` reinforce policy; the generated `.claude/rules/security.md` file is no longer written (legacy projects may still have one)

---

## Commit-time secret scanning

The `haus.lefthook-security` catalog template ships a `lefthook.yml` pre-commit stage:
gitleaks (when installed) plus an always-on grep baseline that scans ADDED lines for
inline credential assignments. This catches secrets at commit time — complementing the
guards (which gate the agent in real time) and `permissions.deny`. `haus-workflow` itself
runs this stage in its own `lefthook.yml` (dogfooding).

---

## Hook contract safety

- Canonical hook config is inlined in `src/claude/load-hooks.ts` (`CANONICAL_HOOKS`)
- `apply --write` writes `.claude/settings.json` from canonical data and self-checks for drift
- `doctor --hooks` detects drift against canonical hook contract

---

## Unsupported stack safety

Recommender blocks known unsupported categories (for example Python, Go, Rust, Java/Spring, mobile app stacks, DeFi/trading patterns) via binary eligibility policy filters (no scoring pipeline).

`haus apply --write` always re-enforces canonical haus hooks and managed deny/ask/allow settings in `.claude/settings.json`; opting out requires uninstalling haus-managed settings, not partial apply.
