# Developer scripts

Manual QA and maintenance scripts in `scripts/`. Not in `yarn verify` — run on demand.

## qa-pass.sh

Single-fixture QA pass: runs `scan` and `recommend` against one fixture, prints structured output.

```bash
scripts/qa-pass.sh <fixture-name>
# e.g.
scripts/qa-pass.sh vendure-monorepo
scripts/qa-pass.sh nextjs-app
```

Requires a built `dist/` (`yarn build`).

## qa-batch.mjs

Batch QA across all synthetic fixtures. Writes per-fixture JSON output to `tmp/qa-out/` and a `summary.json`.

```bash
node scripts/qa-batch.mjs
```

Requires a built `dist/` (`yarn build`). Results land in `tmp/qa-out/` (gitignored).

## postinstall.mjs

The npm postinstall entry (shipped in the package). On a **global** install it runs
`haus install --postinstall`; otherwise it's a no-op. The gate is a pure, exported
`shouldRunPostinstall()` (unit-tested in `tests/postinstall.test.js`); the whole script
is fail-open (always exits 0). Not a manual QA script — documented here as the one
`scripts/` file that ships to consumers.

## Git hooks (Lefthook)

`lefthook.yml` defines pre-commit (lint, format, typecheck, gitleaks + secret-grep) and
pre-push (test). Installed by the `prepare` script (`lefthook install`). Replaces the
former Husky setup; dogfoods the standard haus ships.
