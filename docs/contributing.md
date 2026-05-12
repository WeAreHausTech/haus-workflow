# Contributing

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

1. add `plugin/skills/<name>/SKILL.md`
2. register path in `plugin/.claude-plugin/plugin.json`
3. keep skill guidance scoped and factual

## Add hooks

1. update `plugin/hooks/hooks.json`
2. keep schema valid
3. verify `haus apply --write` + `haus doctor --hooks`

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
