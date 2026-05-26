# Pre-release cleanup checklist

Tracks code, scripts, library data, and docs that exist only as development scaffolding and must be removed (or revisited) before the **v0.1 publish (P10)**.

This file is the **source of truth** for the cleanup tracker. It is reconciled automatically against `HAUS-PRERELEASE-CLEANUP: <reason>` markers in the codebase (in any of the supported comment forms — see "Marker convention" below) by `yarn cleanup:status`.

## Marker convention

Place a marker on a line owned by the dev-only construct (top of file is fine for whole-file deletions):

| File type | Marker |
|---|---|
| `.ts` / `.js` / `.tsx` | `// HAUS-PRERELEASE-CLEANUP: <one-line reason>` |
| `.yml` / shell / JSON-with-comments | `# HAUS-PRERELEASE-CLEANUP: <one-line reason>` |
| pure `.json` | inert top-level key: `"_haus_cleanup": "HAUS-PRERELEASE-CLEANUP: <one-line reason>"` |
| `.md` (no frontmatter) | `<!-- HAUS-PRERELEASE-CLEANUP: <one-line reason> -->` anywhere in the file |
| `.md` with YAML frontmatter | `# HAUS-PRERELEASE-CLEANUP: <one-line reason>` on its own line **inside** the `---` block — keeps `---` as the true first line so frontmatter parsers don't break |

The marker reason is free-form. Keep it short and reference the phase (e.g. "P4a — sources subsystem removal").

## Spec entries

Each cleanup target must have **one row per file** below, in this format:

```
- [ ] `<repo-relative-path>` — <one-line reason / phase reference>
```

Use `- [x]` when the cleanup is complete *and* the file has been deleted in the same PR. Checked rows should be deleted in the cleanup PR (don't leave checked rows behind — empty spec is the goal at v0.1).

## Reconciliation rules

`yarn cleanup:status` reports three states:

- **OK** — file is in spec and has at least one marker. Pair intact.
- **MISSING_SPEC** — marker found in a file with no matching spec row. Add a row here.
- **ORPHAN_SPEC** — spec row exists but no marker found in that file. Either re-add the marker or delete the row.

Exit code is always 0 (non-blocking until P10 makes it blocking).

## Markers

<!-- Add rows below this line. Format: - [ ] `<path>` — <reason> -->
