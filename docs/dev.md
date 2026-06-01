# Developer scripts

Manual QA and maintenance scripts in `scripts/`. Not in `yarn verify` — run on demand.

## qa-pass.sh

Single-fixture QA pass: runs `scan`, `recommend`, and optionally `context --task` against one fixture, prints structured output.

```bash
scripts/qa-pass.sh <fixture-name> "<task>"
# e.g.
scripts/qa-pass.sh vendure-monorepo "build shipping plugin"
scripts/qa-pass.sh nextjs-app
```

Requires a built `dist/` (`yarn build`).

## qa-batch.mjs

Batch QA across all synthetic fixtures and a set of representative tasks. Writes per-fixture JSON output to `tmp/qa-out/` and a `summary.json`.

```bash
node scripts/qa-batch.mjs
```

Requires a built `dist/` (`yarn build`). Results land in `tmp/qa-out/` (gitignored).
