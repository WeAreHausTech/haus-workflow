# Security

Defense in depth across three timings: **deterministic** `permissions.deny` (PreToolUse,
before the model sees the call), **dynamic** PreToolUse guard hooks (real-time backstop),
and **commit-time** secret scanning (Lefthook + gitleaks).

## Deterministic deny rules

`haus install` / `apply` writes a managed `permissions.deny` array into `settings.json`,
derived from the SAME static lists the guards use (`src/security/deny-rules.ts` →
`buildDenyRules()`): each dangerous command → `Bash(<cmd>:*)`, each sensitive path →
`Read/Edit/Write(<glob>)` (directories recursively). This is the deterministic half of
WORKFLOW.md's "enforce critical rules in BOTH CLAUDE.md and settings.json" principle.

A scoped `permissions.allow` (e.g. `Bash(haus doctor:*)`) pre-approves only haus's own
subcommands — never a blanket `Bash(haus:*)` — so a non-developer driving haus from chat
isn't prompted on every step. Both arrays are tracked under `_haus` and stripped on
uninstall, leaving user-defined rules intact.

## Guardrails (PreToolUse hooks)

- `guard file-access` blocks sensitive path access
- `guard bash` blocks dangerous bash command tokens
- Both return explicit, plain-language deny reasons (that still name the blocked
  command/path) — non-developers hit these and must understand them

### Dangerous bash tokens

`src/security/dangerous-commands.ts` — blocked tokens include: `rm -rf`, `sudo`, `chmod -R 777`, `chown -R`, `git push --force`, `git reset --hard`, `docker system prune`, `drop database`, `truncate table`, `php artisan migrate --force`, `npm publish`, `yarn npm publish`, `pnpm publish`.

### Sensitive path patterns

`src/security/sensitive-paths.ts` — blocked patterns include: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`, `*.sql`, `*.dump`, `*.backup`, `*.bak`, `storage/logs`, `wp-content/uploads`, `uploads`, `customer-data`, `exports`, `secrets`, `certs`.

---

## Sensitive data handling

- Scanner excludes sensitive paths from scan set
- Hook-time redactor (`src/security/redact-sensitive.ts`) strips secrets from text the
  context hook would surface
- Generated security rule file (`.claude/rules/security.md`) reinforces policy

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

Recommender blocks known unsupported categories (for example Python, Go, Rust, Java/Spring, mobile app stacks, DeFi/trading patterns) via policy filters in the scoring flow.
