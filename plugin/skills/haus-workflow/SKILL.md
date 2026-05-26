---
# HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5.
name: haus-workflow
description: Run a Haus production-ready coding workflow using only project-relevant context. Use for implementation, debugging, refactoring, testing, review, documentation, and production-readiness checks.
---

# Haus Workflow

## Use when

- task requires code changes with verification
- deterministic explainable workflow is required

## Do not use when

- user asks for brainstorming only
- task requires unsupported stacks or unsafe operations

## Workflow

1. Plan: run `haus context --task "<task>"` and state minimal scope.
2. Execute: make smallest safe change.
3. Verify: run targeted tests, then project validation commands.
4. Report: summarize changed files, validation, and residual risk.

## Rules

- keep prompts small; do not create giant manuals
- never read secrets or production-only sensitive data
- keep output deterministic and auditable

## References

- `references/verification-loop.md`
- `references/safe-change-checklist.md`