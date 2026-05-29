# Security

## Guardrails

- `guard file-access` blocks sensitive path access
- `guard bash` blocks dangerous bash command tokens
- Both return explicit deny reason payloads for hook usage

### Dangerous bash tokens

`src/security/dangerous-commands.ts` — blocked tokens include: `rm -rf`, `sudo`, `chmod -R 777`, `chown -R`, `git push --force`, `git reset --hard`, `docker system prune`, `drop database`, `truncate table`, `php artisan migrate --force`, `npm publish`, `yarn npm publish`, `pnpm publish`.

### Sensitive path patterns

`src/security/sensitive-paths.ts` — blocked patterns include: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`, `*.sql`, `*.dump`, `*.backup`, `*.bak`, `storage/logs`, `wp-content/uploads`, `uploads`, `customer-data`, `exports`, `secrets`, `certs`.

---

## Sensitive data handling

- Scanner excludes sensitive paths from scan set
- Memory text is redacted before write/inject
- Generated security rule file (`.claude/rules/security.md`) reinforces policy

---

## Hook contract safety

- Canonical hook config is inlined in `src/claude/load-hooks.ts` (`CANONICAL_HOOKS`)
- `apply --write` writes `.claude/settings.json` from canonical data and self-checks for drift
- `doctor --hooks` detects drift against canonical hook contract

---

## Unsupported stack safety

Recommender blocks known unsupported categories (for example Python, Go, Rust, Java/Spring, mobile app stacks, DeFi/trading patterns) via policy filters in the scoring flow.
