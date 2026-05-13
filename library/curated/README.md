# library/curated/

This directory holds the **curated external primitives layer** for `@haus/ai`.

Haus AI is a curated Claude Code distribution. It governs and installs the best available Claude-native components deterministically — including external ones where they are better than Haus-authored equivalents. This directory is the governance layer for all such external work.

## What belongs here

| Subdirectory | Purpose |
|---|---|
| `inventory/` | Exhaustive enumeration of every primitive found in each audited source |
| `decisions/` | Per-item decisions: copy, adapted, wrapped, rewritten, reference-only, rejected |
| `external/` | Actual artifacts that were copied or adapted (license permitting) |
| `wrappers/` | Haus wrappers that reference or extend external primitives |
| `references/` | Reference-only items: URLs and notes that inform skills but are not installed |
| `audit/` | Structured audits of the current library state (depth, completeness, gaps) |

## What does NOT belong here

- Haus-owned, Haus-authored content → `library/haus/`
- Catalog metadata → `library/catalog/`
- Plugin skills, agents, hooks → `plugin/`

## Decision types

| `decision` value | Meaning | Required fields |
|---|---|---|
| `copy` | Verbatim copy of upstream content | `license != "unknown"`, `pinnedRef`, `hash` |
| `adapted` | Modified for Haus conventions | same as copy |
| `wrapped` | Haus wrapper references the external item | `originUrl` |
| `rewritten` | Fully Haus-authored, inspired by source | none beyond standard |
| `reference-only` | Used as a URL reference in a skill's `references[]` | `originUrl` |
| `rejected` | Evaluated and not used | `decisionReason` |

## Install gates

Only items with `reviewStatus: "approved"` can be installed. The recommender and apply pipeline both enforce this. Candidate items appear in `inventory/source-inventory.json` and `decisions/curation-decisions.json` but are never selected.

## Audit scripts

```bash
yarn curated:audit    # validates schema, license, pinnedRef, hash, reviewStatus gates
yarn sources:audit    # validates sources.yaml (source-level metadata)
yarn sources:decisions  # validates source-decisions.json (idea-level inspiration)
```

All three run as part of `prepack`.

## Maintenance policy

Every item with `decision: "copy"` or `"adapted"` must be re-reviewed when its upstream source changes. The `maintenancePolicy` field in `curation-decisions.json` describes the cadence.

Do not auto-sync from external registries. All updates are manual and explicit.
