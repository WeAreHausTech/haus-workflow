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
4. run `yarn catalog:audit`

## Add skills

1. add `plugin/skills/<name>/SKILL.md` (auto-discovered by Claude Code — no registration in `plugin.json` needed)
2. keep skill guidance scoped and factual
3. aim for ≤80 lines and a router shape (`## Use when` / `## Do not use when`). Note: `tests/core-skill-shape.test.js` only enforces this on a hardcoded list of **core** skills (`haus-context-router`, `haus-workflow`, `haus-setup-project`, `haus-skill-author`, `haus-global-engineering-rules`). If you intend a new skill to be treated as core, add its path to the `coreSkills` array in that test.

## Add subagents

1. add `plugin/agents/<name>.md` (auto-discovered by Claude Code)
2. keep agent scope narrow and tools minimal

## Add hooks

1. update `plugin/hooks/hooks.json`
2. keep schema valid
3. verify `haus apply --write` + `haus doctor --hooks`

## Add tests

- use built-in Node test runner (`node --test`)
- keep tests deterministic
- prefer fixture-based coverage for scanner/recommender flows

## Add or update source decisions

1. Follow the curation policy in `docs/curation.md`
2. Record accepted ideas in `library/curation/source-decisions.json`
3. Run `yarn sources:decisions` to validate the decision file
4. Run `yarn library:audit` to verify manifest integrity

## What not to add (without explicit requirement)

- terminal UX packages (`chalk`, `ora`, TUI libraries)
- workflow engines
- LLM orchestration frameworks
- broad config frameworks
- shell-string process execution when arg arrays are possible
