# Security

## Guardrails

- `guard file-access` blocks sensitive path access
- `guard bash` blocks dangerous bash command tokens
- both return explicit deny reason payloads for hook usage

## Sensitive data handling

- scanner excludes sensitive paths from scan set
- memory text is redacted before write/inject
- generated security rule file (`./.claude/rules/security.md`) reinforces policy

## Hook contract safety

- canonical hook config comes from `plugin/hooks/hooks.json`
- `apply --write` writes `./.claude/settings.json` from canonical data
- `doctor --hooks` detects drift against canonical hook contract

## Unsupported stack safety

Recommender blocks known unsupported categories (for example Python, Go, Rust, Java/Spring, mobile app stacks, DeFi/trading patterns) via policy filters in scoring flow.
