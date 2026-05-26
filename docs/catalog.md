# Catalog

Catalog lives in `library/catalog/manifest.json`.

- `allowed-stacks.json`: Haus-supported stack allowlist.
- `haus-lock.schema.json`: lockfile schema.
- `manifest.json`: Haus-owned and approved curated skills and agents.
- `../curation/source-decisions.json`: idea-level external inspiration decisions.
- `../curated/`: artifact-level curated external primitives layer.

## Item sources

Catalog items have a `source` field:

| `source` value | Meaning |
|---|---|
| `"haus"` | Haus-owned, Haus-authored content in `library/haus/` |
| `"curated"` | Approved external content in `library/curated/external/` or `wrappers/` |

Curated items require additional fields in the manifest:

```json
{
  "source": "curated",
  "originSourceId": "anthropic-skills",
  "originUrl": "https://github.com/anthropics/skills/...",
  "license": "MIT",
  "licenseConfidence": "high",
  "useMode": "adapted",
  "riskLevel": "low",
  "reviewStatus": "approved",
  "pinnedRef": "abc1234"
}
```

Only `reviewStatus: "approved"` items are selected by the recommender and written by apply.

## `.haus-workflow/haus.lock.json` hashes

Each lock item includes a `hash` field:

- **`paths` non-empty:** `sha256-…` digest derived from the UTF-8 contents of every file under those paths (directories are walked). Changing any tracked file changes the hash.
- **`paths` empty:** deterministic placeholder digest (`haus-lock:empty-paths` token through the same hasher) so the shape stays valid before anything is copied.

Implementation: [`src/update/hash-installed.ts`](../src/update/hash-installed.ts) (`hashInstalledPaths`), used by `haus apply --write` and `haus update`. `haus update` refreshes hashes from disk and keeps other fields unless you edit the lock manually.

Curated items also include provenance fields in the lock: `originSourceId`, `useMode`, `license`, `riskLevel`, `reviewStatus`.

## Skill authoring pipeline

### Haus-owned skill

1. Start from official framework docs and official provider materials.
2. Keep `SKILL.md` short router; move detail to `references/` directory.
3. Add catalog entry with `source: "haus"`, allowed stack tags, role matches, token estimate.
4. Run `yarn catalog:audit && yarn library:audit`.

### Curated external item

1. Add source to `library/catalog/sources.yaml` if not present.
2. Audit upstream source; enumerate primitives into `library/curated/inventory/source-inventory.json`.
3. Record per-item decision in `library/curated/decisions/curation-decisions.json`.
4. Create artifact (if copy/adapted/wrapped).
5. Add manifest entry with all curated fields and `reviewStatus: "approved"`.
6. Run `yarn curated:audit && yarn library:audit`.

See `docs/curated-library.md` for the full authoring workflow.

## Audit commands

```bash
yarn catalog:audit      # validates tags against allowed-stacks.json
yarn sources:audit      # validates sources.yaml
yarn sources:decisions  # validates idea-layer source-decisions.json
yarn library:audit      # validates manifest and skill/agent shapes
yarn curated:audit      # validates curated inventory, decisions, and manifest gates
```
