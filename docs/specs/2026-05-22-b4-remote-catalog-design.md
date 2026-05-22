# B4 — Remote Catalog Fetch

**Date:** 2026-05-22
**Status:** Approved
**Author:** Aniisa Bihi

---

## Problem

The `haus` catalog (`library/catalog/manifest.json`) is bundled with the CLI package. Users only get new skills when they reinstall the CLI. B4 decouples catalog delivery from CLI versioning: new skills become available via `haus update`, without a reinstall.

Plugin slash commands (`/haus-*`) are not affected — they stay fixed to the installed plugin version.

---

## Scope

**In scope:**
- Fetch `manifest.json` from a GitHub raw endpoint on `haus update`
- Download content files (`SKILL.md`) for items not present in the installed package
- Cache everything at `.haus-ai/catalog/`
- `loadCatalog` and `write-claude-files` prefer the remote cache over the package bundle for new items
- `haus update --check` reports new items without writing

**Out of scope:**
- Plugin skill updates (plugin stays fixed to installed version)
- CLI self-update / version checking (deferred — see Future Versioning section)

---

## Remote Endpoint

The catalog is served from the public GitHub raw URL of the `main` branch:

```
Manifest:  https://raw.githubusercontent.com/WeAreHausTech/haus-ai-workflow/main/library/catalog/manifest.json
Content:   https://raw.githubusercontent.com/WeAreHausTech/haus-ai-workflow/main/{item.path}/SKILL.md
```

No dedicated API or CDN is required. The repo is the source of truth.

---

## Architecture

### Data flow

```
haus update
  └─ syncRemoteCatalog(root)
       ├─ fetchRemoteManifest()          → remote manifest items
       ├─ compare vs bundled manifest    → identify new items
       ├─ fetchRemoteContent(item.path)  → SKILL.md for each new item
       └─ write to .haus-ai/catalog/
            ├─ manifest.json            (full remote manifest)
            └─ {item.path}/SKILL.md     (content for new items only)

haus recommend / haus context
  └─ loadCatalog(root)
       priority: local override → .haus-ai/catalog/manifest.json → package bundle

haus apply --write
  └─ write-claude-files(root)
       per recommended item:
         sourcePath: .haus-ai/catalog/{item.path} ?? pkgRoot/{item.path}
```

### New and modified files

| File | Change |
|---|---|
| `src/catalog/remote-catalog.ts` | New — all network logic |
| `src/catalog/load-catalog.ts` | Modified — add remote cache tier |
| `src/claude/write-claude-files.ts` | Modified — prefer remote cache path |
| `src/commands/update.ts` | Modified — add sync step |

---

## Component Detail

### `src/catalog/remote-catalog.ts` (new)

```ts
const REMOTE_BASE = "https://raw.githubusercontent.com/WeAreHausTech/haus-ai-workflow/main";
const REMOTE_MANIFEST_URL = `${REMOTE_BASE}/library/catalog/manifest.json`;

fetchRemoteManifest(): Promise<CatalogItem[]>
fetchRemoteContent(itemPath: string): Promise<string | null>
syncRemoteCatalog(root: string): Promise<{ newItems: string[]; unchanged: number }>
```

- All network errors are caught, logged as warnings, and return empty/null — never throw
- `syncRemoteCatalog` skips items already present at `pkgRoot/{item.path}/SKILL.md`
- Writes remote manifest to `.haus-ai/catalog/manifest.json`
- Writes new content to `.haus-ai/catalog/{item.path}/SKILL.md`

### `src/catalog/load-catalog.ts` (modified)

Lookup order becomes:
1. `{root}/library/catalog/manifest.json` (local dev override, unchanged)
2. `.haus-ai/catalog/manifest.json` (remote cache, new)
3. `{packageRoot}/library/catalog/manifest.json` (bundled, unchanged)

### `src/claude/write-claude-files.ts` (modified)

At the `sourcePath` resolution (currently line 126), check remote cache first:

```ts
const remoteCachePath = path.join(root, ".haus-ai", "catalog", manifestItem.path);
const sourcePath = (await fs.pathExists(remoteCachePath))
  ? remoteCachePath
  : path.join(pkgRoot, manifestItem.path);
```

### `src/commands/update.ts` (modified)

`haus update --check`:
- Fetch remote manifest only (no writes)
- Compare item count / IDs against bundled manifest
- Report: "N new skills available — run `haus update` to fetch them"
- Exit 0

`haus update` (full):
- Run existing lockfile hash refresh (unchanged)
- Call `syncRemoteCatalog(root)` — fetch manifest + new content
- Report new item IDs and total
- Prompt user to re-run `haus recommend && haus apply --write` if new items were fetched

---

## New skill inclusion logic

New skills fetched from remote follow the **existing recommender logic** — no manual installation:

- Items with `"default": true` are always recommended
- Items with `requiresAny` conditions are included only if the repo stack matches
- `haus apply --write` writes whatever `haus recommend` selected

No changes to the recommender or apply command are needed.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Network unavailable | `warn("Remote catalog fetch failed — using bundled catalog")`, continue |
| Remote manifest malformed | Warn and skip remote, use bundled |
| Partial content fetch fails | Skip that item, log warning, continue with others |
| `.haus-ai/catalog/` not writable | Warn and skip caching, use bundled |
| Remote item references unknown path format | Skip item, log warning |

---

## Testing

### `tests/remote-catalog.test.js` (new)

Uses a local mock HTTP server (Node built-in `http`). Covers:
- Successful manifest fetch + cache write
- Successful content fetch for new items
- Network failure → graceful fallback, no crash
- `--check` mode: reports count, writes nothing
- No duplicate downloads for items already present in package

### `tests/update.test.js` (modified)

- `haus update` with mocked remote reports new item IDs
- `haus update --check` reports count, exits 0, writes no files

### `tests/apply.test.js` (modified)

- Recommended item present in `.haus-ai/catalog/` but not in `pkgRoot` → `haus apply --write` uses cached content and writes it correctly

---

## Docs

- **`docs/update.md`** — document remote catalog fetch behaviour, `.haus-ai/catalog/` contents, how to force re-fetch
- **`README.md`** — add `haus update` to command reference with remote catalog note

---

## Future: CLI and plugin versioning

This section records a deferred decision for a future phase.

**Why deferred:** B4 decouples skill delivery from the CLI binary — new skills reach users without a CLI reinstall. This reduces the urgency of frequent CLI updates and gives time to design versioning properly.

**Future CLI versioning:**
Publish the `haus` CLI to npm (package already structured for this). `haus update` can then check the npm registry for a newer version and prompt the user to run `npm update -g @haus/ai`. The current "clone + build + install" path becomes a contributor workflow only.

**Future plugin versioning (`haus plugin update`):**
Claude Code's plugin system clones the repo at install time with no built-in update mechanism. Users should not be required to manually re-run `/plugin marketplace add` + `/plugin install`. A `haus plugin update` command should be added that:
1. Locates the installed plugin directory (from Claude Code's plugin registry or a known path)
2. Runs `git pull` (or re-clones) to update the plugin content
3. Triggers Claude Code to reload the plugin

This is a separate design task and must not be blocked on B4.
