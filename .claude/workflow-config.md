# Project workflow configuration

> Project-specific values for the workflow standard in WORKFLOW.md.
> Edit freely — this file is project-owned and will not be overwritten by haus.

## Source-of-truth documents

- Plans: `docs/plans/<feature-slug>.md`

## Commands

- Build: `yarn build`
- Test: `yarn test`
- Full verification: `yarn verify`
- Type check: `yarn typecheck`
- Lint: `yarn lint`
- Format check: `yarn format:check`
- Security audit: `yarn security:audit`
- Dev (no build): `yarn dev <cmd>`

## Validation library

n/a — internal TypeScript; no user-facing input validation

## Highest-stakes logic

Template tamper detection and hash-based update logic (`src/claude/write-workflow.ts`, `src/claude/write-project-facts.ts`). A bug here silently blocks catalog updates for all downstream users.

## Pre-commit tool

Husky (`prepare` script in package.json)
