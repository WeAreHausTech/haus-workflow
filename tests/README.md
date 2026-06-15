# Tests

Node built-in test runner (`node --test`). No framework. All test files are `.js` (compiled output not required — tests import from `dist/` via `fixture-runner.js`).

```bash
yarn test          # full suite
yarn test:fast     # unit tests only (pre-push hook)
```

`yarn test` uses `scripts/run-tests.mjs`: compact `.` / `X` progress during the run, then a
summary line and a `FAILURES` block at the end when anything fails (no scrolling through
hundreds of passing tests to find the error).

Pre-push runs `test:fast`; CI runs `test:coverage` (full suite). Integration tests are
listed in `scripts/test-fast.mjs` — add new CLI/git/fixture tests there.

## Structure

| Path              | Contents                           |
| ----------------- | ---------------------------------- |
| `tests/*.test.js` | Unit and integration tests         |
| `tests/helpers/`  | Shared test utilities              |
| `tests/fixtures/` | Static fixture repos used by tests |

## helpers/fixture-runner.js

Utilities for running the compiled CLI against fixture repos in a temp directory:

- `cloneFixtureToTemp(fixtureName)` — copies `tests/fixtures/repos/<name>` to a temp dir, returns the path
- `runHaus(cwd, command)` — runs `node dist/cli.js <command>` in `cwd`, returns stdout
- `readHausJson(cwd, fileName)` — reads `.haus-workflow/<fileName>` as parsed JSON

Tests that use `fixture-runner.js` require a built `dist/` — run `yarn build && yarn test`, or use `yarn verify` which builds before running tests.

## fixtures/

### fixtures/repos/

Full fixture repos scanned by integration tests and golden tests. Each subdirectory is a minimal repo skeleton:

| Fixture                          | Stack                                 |
| -------------------------------- | ------------------------------------- |
| `laravel-app`                    | Laravel (PHP, Composer, PHPUnit)      |
| `laravel-with-react-frontend`    | Laravel + React (pnpm)                |
| `nest-graphql-api`               | NestJS + GraphQL (Yarn)               |
| `nextjs-app`                     | Next.js (pnpm)                        |
| `nx-workspace`                   | Nx monorepo (Yarn)                    |
| `orphan-graphql-config`          | GraphQL config without backend (pnpm) |
| `turbo-monorepo`                 | Turborepo (Yarn)                      |
| `vendure-monorepo`               | Vendure e-commerce (Yarn)             |
| `vendure-with-nextjs-storefront` | Vendure + Next.js storefront (Yarn)   |
| `wordpress-bedrock-site`         | WordPress Bedrock (Composer)          |
| `wordpress-with-node-tooling`    | WordPress + Node tooling (pnpm)       |

### Other fixture dirs

- `fixtures/dotnet-service/` — unsupported stack (C#/.NET), used to verify unsupported-stack handling
- `fixtures/unsupported-go/` — unsupported stack (Go)
- `fixtures/unsupported-python/` — unsupported stack (Python)
- `fixtures/vendure-plugin/` — minimal Vendure plugin package
- `fixtures/laravel-app/`, `fixtures/next-react-app/`, `fixtures/wordpress-bedrock/` — legacy shallow fixtures; prefer `fixtures/repos/` equivalents for new tests
