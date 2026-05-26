---
# HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5.
name: haus-global-engineering-rules
description: Core Haus engineering guardrails for deterministic, secure, minimal-context delivery.
---

# Haus Global Engineering Rules

## Use when

- applying default Haus engineering standards
- task affects production behavior, quality, or security posture

## Do not use when

- task requires unsupported technology stack
- user requests behavior outside security guardrails

## Rules

- keep context minimal and task-scoped
- keep changes small, test-backed, and auditable
- never read secrets, private keys, dumps, or customer exports
- report validation run and known gaps

## References

- `references/security-posture.md`
- `references/tests-and-validation.md`
- `references/change-discipline.md`