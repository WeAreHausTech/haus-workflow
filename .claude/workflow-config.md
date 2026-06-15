# Project workflow configuration

> Project-specific values the workflow standard (WORKFLOW.md) binds to.
> Edit freely — this file is project-owned and will not be overwritten by haus.
>
> Everyday commands (build, dev, lint, typecheck, format) and project documentation
> live in `CLAUDE.md` + `docs/` — run **`/docs`** to generate/refresh them.

## Source-of-truth documents

- Plans: `docs/plans/<feature-slug>.md`

## Test commands (TDD / verification gate)

- Test (unit + integration): `yarn test`
- Test (pre-push subset): `yarn test:fast`
- Test (E2E): n/a — no E2E suite

## Highest-stakes logic

Template tamper detection and hash-based update logic (`src/claude/write-workflow.ts`,
`src/claude/managed-template.ts`). A bug here silently blocks catalog updates for all
downstream users. Binary recommender eligibility + policy gates (`src/recommender/`):
a wrong gate silently drops or leaks a context asset.

## Pre-commit tool

Lefthook (`lefthook.yml`; installed via the `prepare` script). pre-commit gates
lint + format + typecheck + secret scan (gitleaks + grep); pre-push runs `test:fast`
(unit only). CI runs full `test:coverage`.
This dogfoods the standard haus ships (`haus.lefthook-security`).
