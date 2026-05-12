# Curation Policy

This file defines how external ideas become Haus-owned skill library content.

## Inspiration and reference sources

Public repos, indexes, and packaging sites are **inspiration** or **reference** sources. Some remain **candidate** sources until Haus explicitly promotes them in `library/catalog/sources.yaml`. The policy is not to avoid OSS influence—it is to control *how* it enters the product:

- Haus ships **rewritten** guidance only (Haus voice, Haus file layout).
- No **verbatim** external skill prose in shipping assets.
- No **upstream runtime dependency** on a source registry or sync job.
- No **automatic import** of external listings into the catalog or install path.

## Curation loop

1. Study source materials.
2. Extract candidate ideas.
3. Run gate checks.
4. Rewrite as Haus-owned guidance.
5. Record decision metadata in `library/curation/source-decisions.json`.
6. Run `yarn sources:decisions` (validates schema, source list, and decision rows).
7. Validate with catalog, recommender, and apply tests.

## Gate checks

An idea is accepted only if all are true:

- fits Haus product goal (Claude-native workflow layer)
- improves Claude Code developer workflow
- can be rewritten as Haus-owned guidance
- supports minimal/progressive context
- maintainable without upstream sync dependence
- does not add runtime, framework, marketplace, or registry-driven behavior
- does not pull unsupported stacks

## Source decision artifact

Decisions live in `library/curation/source-decisions.json`.
Schema lives in `library/curation/source-decisions.schema.json`.
Validator script: `yarn sources:decisions`.

Accepted ideas require:

- `idea`
- `target` (single concrete file path per row)
- `reason`
- `copied: false`
- `maintenanceRisk`
- `licenseAttributionConcern`
- `productFit`

## Haus notes from inspiration sources (documentation only)

These sections record **accepted** patterns in Haus wording. They are not copies of upstream prompts.

### superpowers (reference / inspiration)

- **Red–green–refactor for risky edits:** prefer a failing check first, smallest change to pass, then tidy. Habits only—no new hooks, no scoring changes, no edits to stack skill trees required by curation alone.
- **Scope pause:** if the task boundary is unclear, ask one focused question before scanning the whole repo.
- **Evidence before claims:** end a slice of work with stated intent, files touched, and what validation was actually run (not assumed).

### ECC (candidate inspiration)

ECC is a **candidate inspiration** source, not a product dependency. Haus may borrow **ideas** only.

- **Progressive disclosure:** load deep reference material only when the active task touches that surface.
- **Router vs depth:** keep `SKILL.md` thin; put durable detail under `references/` next to the skill.

## Copying and attribution policy

- No verbatim external skill text in shipping assets.
- No syncing external repos into the runtime install path.
- Inspiration and reference sources inform Haus-owned rewrites; decisions and targets are recorded for audit.

## Future work (PR6)

- Replace substring-based banned-term checks in `scripts/validate-source-decisions.ts` with token-aware or word-boundary matching to cut false positives (for example accidental hits inside unrelated words).
