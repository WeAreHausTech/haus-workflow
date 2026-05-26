# Contributing

## Before opening a PR

Run the full quality gate — it typechecks, lints, builds, tests, and runs all audit scripts:

```bash
yarn verify
```

All checks must pass. Do not open a PR with a failing `yarn verify`.

## Add a command

1. implement command module in `src/commands/<name>.ts`
2. wire command in `src/cli.ts`
3. add/update tests in `tests/*.test.js`
4. update `docs/commands.md`, `docs/user-guide.md` if user-facing

## Add scanner detection

1. update `src/scanner/scan-project.ts` role/stack logic
2. keep sensitive-path filtering intact
3. add or update scanner/recommendation golden tests
4. update `docs/architecture.md` + `docs/technical-guide.md`

## Add catalog entries

1. update `library/catalog/manifest.json`
2. keep `requiresAny`, tags, repo roles accurate
3. verify unsupported policy and ecosystem compatibility behavior
4. run `haus catalog-audit`

## Add skills

Skills live in `library/global/skills/` (P5 layout — see implementation plan). Keep skill guidance scoped and factual; aim for ≤80 lines and a router shape (`## Use when` / `## Do not use when`).

## Add subagents

Agents live in `library/global/agents/` (P5 layout). Keep agent scope narrow and tools minimal.

## Add hooks

1. update `~/.claude/settings.json` via `haus install` (P5 layout)
2. verify with `haus doctor --hooks`

## Add tests

- use built-in Node test runner (`node --test`)
- keep tests deterministic
- prefer fixture-based coverage for scanner/recommender flows

## What not to add (without explicit requirement)

- terminal UX packages (`chalk`, `ora`, TUI libraries)
- workflow engines
- LLM orchestration frameworks
- broad config frameworks
- shell-string process execution when arg arrays are possible
