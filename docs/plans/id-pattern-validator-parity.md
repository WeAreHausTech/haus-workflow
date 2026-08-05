# CLI `id`-pattern validator parity — Implementation Plan

**Goal:** Close a real, previously-undiscovered validator divergence between this repo and `haus-workflow-catalog`: the catalog repo's ajv schema enforces every item `id` matches `^haus\.` (universal — no exemption for `source: "curated"`, confirmed against all 118 real items and this repo's own fixture, 0 exceptions either side); this repo's hand-written `auditManifestStructure` (`src/catalog/validate-core.ts`) never checks it at all.

**Source:** found while building ADR-0024's shared fixture set ([PR #196](https://github.com/WeAreHausTech/haus-workflow/pull/196)), flagged as out-of-scope for that PR, tracked here as its own follow-up per the [audit](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd) (§E, side-finding).

**State verified:** 2026-08-05, against `main` @ `8caf76f` (v1.4.1, post-#196 merge).

## Scope

One check, one file. Not touching the schema/rule data (already correct, catalog-side), not adding ajv as a dependency here (ADR-0005 already rejected that — ADR-0005 "Alternatives considered": _"Vendor a JSON-schema validator (ajv). Rejected: the repo has no ajv and the contract is expressible as a key-set/enum structural check"_ — same reasoning applies: this is one regex, not worth a new dependency).

## Task — add the `id`-pattern check to `auditManifestStructure`

**Do:** In `src/catalog/validate-core.ts`, add a check mirroring `catalog-item.schema.json`'s `properties.id.pattern: "^haus\\."`, in the same hand-written style as the existing `title`/`source`/`type` checks in `auditManifestStructure` (`src/catalog/validate-core.ts:140-`):

```ts
const ITEM_ID_PATTERN = /^haus\./

// inside the per-item loop, alongside the existing title/source checks:
if (!ITEM_ID_PATTERN.test(item.id)) {
  failures.push(`${item.id}: id must start with "haus." (got "${item.id}")`)
}
```

Applies to every item unconditionally (no `source` gate) — matches the schema's actual (unconditional) enforcement, not the source-scoped behavior I originally (incorrectly) assumed when flagging this.

**Acceptance criteria:**

- A fixture item with an id not starting with `haus.` fails `validateCatalogData()` with a clear message; one that does start with `haus.` is unaffected.
- Running `haus validate-catalog` against the real `haus-workflow-catalog` checkout still passes clean (118 items, all already `haus.`-prefixed — no behavior change for real data).
- This repo's own `tests/fixtures/catalog/manifest.json` still passes (already 0 exceptions).
- ADR-0024's `tests/fixtures/contract-behavior/{clean,bad,orphan-only}/manifest.json` fixtures still agree between both validators (they already use `haus.fixture-*` ids — no change needed there, but re-run `check:contract-behavior` to confirm nothing regressed).

**Verification:** `yarn test`, `yarn typecheck`, `yarn build`; manual `haus validate-catalog` against the sibling catalog checkout; manual `yarn check:contract-behavior`.

**Dependencies:** none. **Risk:** low — additive check, real data already conforms on both sides; the only way this surfaces a new failure is a genuinely malformed id, which is exactly the point.

## Out of scope

- Changing the schema or `validation-rules.json` — already correct, this is a CLI-side-only gap.
- Broader ajv adoption in the CLI — ADR-0005 already settled this; not reopening it for one regex.

## Suggested branch

```bash
git worktree add .claude/worktrees/id-pattern-validator-parity -b fix/id-pattern-validator-parity
```
