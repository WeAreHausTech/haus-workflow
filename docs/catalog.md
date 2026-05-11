# Catalog

Catalog lives in `library/catalog/manifest.json`.

- `allowed-stacks.json`: Haus-supported stack allowlist.
- `haus-lock.schema.json`: lockfile schema.
- `manifest.json`: curated Haus-owned skills and agents.

## `.haus-ai/haus.lock.json` hashes

Each lock item includes a `hash` field:

- **`paths` non-empty:** `sha256-…` digest derived from the UTF-8 contents of every file under those paths (directories are walked). Changing any tracked file changes the hash.
- **`paths` empty:** deterministic placeholder digest (`haus-lock:empty-paths` token through the same hasher) so the shape stays valid before anything is copied.

Implementation: [`src/update/hash-installed.ts`](../src/update/hash-installed.ts) (`hashInstalledPaths`), used by `haus apply --write` and `haus update`. is the `@haus/ai` package version used when the row was written by `haus apply --write`. `haus update` refreshes hashes from disk and keeps other fields unless you edit the lock manually.

## Skill authoring pipeline

1. Start from official framework docs and official provider materials.
2. Curate selected external workflows (Superpowers/ECC/etc) into Haus-owned patterns.
3. Keep `SKILL.md` short router; move detail to references.
4. Add catalog entry with allowed stack tags, role matches, token estimate.
5. Run:

```bash
yarn catalog:audit
yarn sources:audit
```
