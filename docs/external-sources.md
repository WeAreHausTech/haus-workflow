# External Sources Policy

## Core rules

- No auto-install from public repos. No live registry sync.
- Pin every source to a specific version/hash in `library/catalog/sources.yaml`.
- Unknown license → `candidate` status only by default; cannot install until license is resolved or explicitly accepted with `licenseConfidence: "accepted-unknown"` and a written justification in `curation-decisions.json`.
- Unsupported stacks are rejected at audit and cannot ship as installables.
- All reuse must be curated, licensed, pinned, hashed, reviewed, and deterministic.

## Two-layer curation model

**Idea layer** — `library/curation/source-decisions.json`
Records which ideas from external sources inspired Haus-owned rewrites. Always `copied: false`. Validated with `yarn sources:decisions`.

**Artifact layer** — `library/curated/decisions/curation-decisions.json`
Records per-item decisions for every audited upstream primitive. Supports `copy`, `adapted`, `wrapped`, `rewritten`, `reference-only`, `rejected`. Validated with `yarn curated:audit`.

## Decision modes

| Mode | Meaning |
|---|---|
| `copy` | Verbatim copy; requires known license + pinnedRef + hash |
| `adapted` | Modified for Haus conventions; same requirements as copy |
| `wrapped` | Haus wrapper references the external item |
| `rewritten` | Fully Haus-authored, inspired by source |
| `reference-only` | URL reference in a skill; not installed |
| `rejected` | Not used; reason recorded |

## Source useMode (per sources.yaml)

| `useMode` | Meaning |
|---|---|
| `adapt-allowed` | Individual items may be copied/adapted with license review |
| `rewrite-only` | Ideas only; no verbatim copy or adaptation |
| `reference` | URLs and structure only; no artifacts |

## Validation gates

```bash
yarn sources:audit      # validates sources.yaml (host allowlist, license, pinnedVersion/Hash)
yarn sources:decisions  # validates idea-layer decisions (copied:false constraint)
yarn curated:audit      # validates artifact-layer inventory and decisions
yarn library:audit      # validates manifest curated items have approved reviewStatus
```

All four run as part of `prepack`.

## Full documentation

See `docs/curated-library.md` for the complete curated library policy, directory structure, decision types, and authoring workflow.
