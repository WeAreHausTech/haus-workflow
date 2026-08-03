# ADR-0015: Catalog formerIds → lock migrate on update/apply

- **Status:** Accepted | **Date:** 2026-08-03
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/catalog/former-ids.ts`, `src/claude/write-claude-files.ts`, `src/commands/update.ts`, `src/recommender/recommend.ts`, `src/catalog/manifest-item-fields.ts`
- **Related:** catalog [ADR-0014](https://github.com/WeAreHausTech/haus-workflow-catalog/blob/main/docs/decisions/0014-select-upstream-renames.md); design `haus-workflow-catalog/docs/superpowers/specs/2026-08-03-select-upstream-rename-aliases-design.md`

## Context

Select upstream sync can rename allowlisted skills (new catalog id + `formerIds: [oldId]`). Consumer projects keep the old id in `haus.lock.json`. Without migration they would need a fresh scan/recommend to pick up the rename, or would treat the old install as stale.

## Decision

1. **Lock migrate on `haus update` / `haus apply`.** Build `formerId → currentId` from catalog `formerIds`. Rewrite matching lock entries to the current id, refresh installed files/hashes from the current item, and warn `migrated <old> → <new> (upstream rename)`. No rescan required.
2. **`--check` is read-only.** Report pending `formerIdMigrations` and exit non-zero without writing.
3. **`--select` scopes migration.** Only migrate (warn / cleanup / install) when the selection includes the old id and/or the new id; deselected former-id installs stay untouched.
4. **Recommender never newly recommends a former id.** Current items that _own_ `formerIds` remain eligible.
5. **CLI validates `formerIds` uniqueness** (same invariants as the catalog) so bad catalogs fail closed before migrate.

## Motivation (why)

- Upstream renames are common; forcing a rescan breaks the “update keeps you current” contract.
- New id + `formerIds` (vs stable id) was locked in the catalog design so history stays explicit and lock rewrite stays mechanical.
- Soft-hold / rename detection live in the catalog sync; the CLI only consumes the published alias field.

## Alternatives considered

- **Stable catalog id across renames** — rejected upstream; path/name changes would still need file refresh, and id-from-name is the existing scheme.
- **Sync-only detection, no CLI migrate** — rejected; projects would keep dead lock ids until manual rescan.
- **Auto-migrate without `--select` filter** — rejected; would delete/refresh deselected installs and break apply `--select` semantics.

## Consequences

- Catalog must ship `formerIds` (and renamed items) before consumer migrate does anything useful — merge catalog rename PR first.
- Duplicate or colliding `formerIds` in a catalog hard-fail validation / map build with owner ids named in the error.
- Hash-gated cleanup of old paths mirrors `undo` / stale-cleanup: missing recorded paths are excluded from the hash set so empty digests do not spuriously preserve or delete.
