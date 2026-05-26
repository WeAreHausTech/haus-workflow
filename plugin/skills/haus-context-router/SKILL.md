---
# HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5.
name: haus-context-router
description: Route to minimal relevant context before coding. Use for task-scoped context selection and explainability.
---

# Haus Context Router

## Use when

- implementation/debug/review task has clear target
- context must stay small and auditable

## Do not use when

- task intent is unclear and needs clarification first
- user requests broad repo-wide exploration

## Router

1. Run `haus context --task "<task>" --json`.
2. If needed, run `haus explain-context --task "<task>"`.
3. Load only selected context artifacts and direct dependencies.
4. Avoid unrelated ecosystem skills and baseline noise.

## References

- `references/context-minimization.md`
- `references/task-intents.md`