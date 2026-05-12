# haus-documentation-maintainer

Maintain docs for `@haus/ai` whenever behavior changes.

## Use when

- command behavior changes
- dependencies in `package.json` change
- scanner/recommender/apply/update/memory/security logic changes
- generated files under `.haus-ai` or `.claude` change
- plugin skills/hooks layout changes

## Documentation freshness triggers

Update docs when any of these change:

- `package.json` runtime dependencies
- command add/rename/remove in `src/cli.ts` or `src/commands/*`
- generated file structure in `.haus-ai` or `.claude`
- plugin structure (`plugin/skills`, `plugin/hooks`, `plugin/.claude-plugin/plugin.json`)
- scanner or recommender behavior/policies
- security guardrails
- memory behavior
- update/lockfile behavior
- supported/unsupported stack policy

## Required workflow

1. Inspect repo first. Do not guess.
2. Read `package.json` before dependency docs.
3. Read `src/cli.ts` and command modules before command docs.
4. Read scanner/recommender/update/memory/security modules before technical docs.
5. Update docs listed below. Keep concise and accurate.
6. Mark planned/incomplete items explicitly.
7. Never document unsupported stacks as supported.
8. Never invent commands or features.

## Docs to maintain

- `README.md` (short entrypoint)
- `docs/user-guide.md`
- `docs/technical-guide.md`
- `docs/architecture.md`
- `docs/dependencies.md`
- `docs/commands.md`
- `docs/generated-files.md`
- `docs/security.md`
- `docs/memory.md`
- `docs/updates.md`
- `docs/plugin.md`
- `docs/contributing.md`

## Quality gates

- run `yarn build`
- run `yarn test`
- run `yarn catalog:audit`

## References

- `plugin/skills/haus-documentation-maintainer/references/documentation-checklist.md`
- `plugin/skills/haus-documentation-maintainer/references/documentation-style.md`
