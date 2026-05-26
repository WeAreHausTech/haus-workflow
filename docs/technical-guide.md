# Technical Guide

## Generated files

See `generated-files.md` for full list.
Generator entrypoint: `src/claude/write-claude-files.ts`.

## Recommendation scoring and explainability

Scoring entrypoint: `src/recommender/recommend.ts`.

Signals include:

- default baseline
- repo role and stack/dependency matches
- guided setup goal matches
- package-manager signals
- config warnings and changed-file hints

Penalties include:

- unsupported policy
- sensitive policy
- source trust/approval policy
- ecosystem conflict
- role-only bleed guard

Output preserves structured reason and skip-reason codes.

## Unsupported stacks

Recommender hard-filters unsupported families via policy list.
Do not document unsupported stacks as supported behavior.

## Security guardrails

- file guard checks sensitive path patterns
- bash guard checks dangerous command tokens
- memory redaction strips risky secret-like text

## Local memory

Memory is filesystem-backed in `./.haus-workflow/memory`.
No remote sync in current implementation.

## Updates and overrides

- update refreshes lock hashes
- update creates backup before rewrite
- update preserves local override files and reports that behavior

## Lockfiles

Lock rows store version + hash + tracked paths.
Version checks use `semver` utilities.

## Process execution

Process calls should go through `src/utils/exec.ts` (`execa`).
Use arg arrays; avoid shell command strings when possible.
