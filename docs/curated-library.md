# Curated Library

`haus` is a curated Claude Code distribution. It governs and installs the best available Claude-native components for Haus projects — including external ones where they are better than Haus-authored equivalents.

The curated library layer (`library/curated/`) is the governance mechanism for all external content.

## Product framing

```
haus = curated deterministic Claude Code distribution for Haus projects
```

Haus-owned means **Haus-governed**, not Haus-authored-everything. Every external primitive that ships must be:

- individually audited
- licensed (or explicitly accepted as unknown with written justification)
- pinned to a specific upstream commit or version
- hashed for integrity
- reviewed and approved by a human before it can install

No random public install. No live registry sync. No unreviewed marketplace behavior.

## Directory structure

```
library/curated/
  README.md                          # Policy overview
  inventory/
    source-inventory.schema.json     # Schema for per-source item enumeration
    source-inventory.json            # All discovered primitives (populated in PR8)
  decisions/
    curation-decisions.schema.json   # Schema for per-item decisions
    curation-decisions.json          # Per-item verdicts (populated in PR8)
  external/                          # Verbatim copies and adaptations
  wrappers/                          # Haus wrappers around external items
  references/                        # Reference-only items (URLs, not files)
  audit/
    current-library-audit.json       # Depth audit of existing library skills (PR9)
```

## Two-layer model

The curated library uses two distinct layers:

**Layer 1 — Idea inspiration** (`library/curation/source-decisions.json`)
Tracks which ideas from external sources were used as inspiration for Haus-owned rewrites. The `copied: false` constraint is intentional and permanent — this layer is ideas only.

**Layer 2 — Artifact inventory** (`library/curated/decisions/curation-decisions.json`)
Tracks actual upstream artifacts — skills, agents, hooks, commands, references — and what was decided for each. This layer supports copy/adapted/wrapped/rewritten/reference-only/rejected decisions.

These two layers are separate by design. Do not conflate them.

## Decision types

| `decision` | Meaning | When to use |
|---|---|---|
| `copy` | Verbatim copy of upstream artifact | License explicitly permits; no adaptation needed |
| `adapted` | Modified for Haus conventions | Upstream is good but needs adjustments |
| `wrapped` | Haus wrapper calls or extends the external | External is a tool/command; we define usage |
| `rewritten` | Fully Haus-authored, inspired by source | Ideas extracted; no original text ships |
| `reference-only` | URL or note in a skill's `references[]` | Useful doc; not installed as a file |
| `rejected` | Evaluated and not used | Out of scope, unsafe, unsupported stack, or poor quality |

## Required fields by decision type

| Field | `copy` | `adapted` | `wrapped` | `rewritten` | `reference-only` | `rejected` |
|---|---|---|---|---|---|---|
| `pinnedRef` | required | required | optional | — | — | — |
| `hash` | required | required | — | — | — | — |
| `license` | required¹ | required¹ | recommended | — | — | — |
| `targetPath` | enforced in PR8 | enforced in PR8 | optional | — | — | — |
| `reviewStatus` | `approved` | `approved` | `approved` | `approved` | — | `rejected` |

¹ A known SPDX license is required, or `licenseConfidence: "accepted-unknown"` with a written `licenseAcceptedUnknownJustification`.

## Install gates

Only items with `reviewStatus: "approved"` can install. Multiple enforcement layers:

1. **Recommender** (`src/recommender/recommend.ts`) — curated items without `reviewStatus: "approved"` receive a -100 penalty and are skipped
2. **Apply** (`src/claude/write-claude-files.ts`) — warns and skips curated items without `reviewStatus: "approved"`
3. **Library audit** (`src/library/audit-library.ts`) — manifest curated items require `reviewStatus: "approved"`, `originSourceId`, `license`, `riskLevel`
4. **Curated audit** (`scripts/audit-curated.ts`) — validates decisions file, license gates, hash requirements, targetPath existence, manifest consistency

## Catalog item fields for curated items

When a curated item is added to `library/catalog/manifest.json`, it must include these additional fields:

```json
{
  "id": "curated.example-item",
  "source": "curated",
  "originSourceId": "anthropic-skills",
  "originUrl": "https://github.com/anthropics/skills/tree/main/...",
  "license": "MIT",
  "licenseConfidence": "high",
  "useMode": "adapted",
  "riskLevel": "low",
  "reviewStatus": "approved",
  "pinnedRef": "abc1234def5678"
}
```

## Audit script

```bash
yarn curated:audit
```

Checks:
- Schema files exist
- Inventory file (if present) references valid `sourceId` values and has no duplicate ids
- Decisions file (if present) enforces: pinnedRef/hash for copy/adapted, license gates, no placeholder tokens in artifacts, no manifest curated items without `reviewStatus: "approved"`, no duplicate ids

## Authoring a new curated item

1. Add the source to `library/catalog/sources.yaml` if not present (or confirm it exists)
2. Audit the upstream source — enumerate all primitives into `source-inventory.json`
3. For each primitive, decide: copy / adapted / wrapped / rewritten / reference-only / rejected
4. Record the decision in `curation-decisions.json` with all required fields
5. For `copy`/`adapted`: create the artifact in `library/curated/external/{sourceId}/`
6. For `wrapped`: create the wrapper in `library/curated/wrappers/`
7. For `rewritten`: create the Haus-owned item in `library/haus/skills/` or `agents/`
8. For `reference-only`: add the URL to the relevant skill's `references[]` in manifest
9. For `rejected`: record in decisions with reason — no artifact needed
10. Add approved installable items to `library/catalog/manifest.json` with all curated fields
11. Run `yarn curated:audit && yarn library:audit` — both must pass

## Sources to audit

See `library/catalog/sources.yaml` for the current source registry. Priority order for audit (PR8):

1. `anthropic-skills` (approved, MIT) — highest trust
2. `superpowers` (approved, MIT) — workflow patterns
3. `ecc` (candidate) — token/context techniques
4. `jeffallan-skills` (candidate) — organization model
5. `skills-sh`, `prpm`, `skillkit` (candidate) — discovery indices
6. Stack-specific references: Vendure llms.txt, Next.js docs, Laravel docs, etc.
