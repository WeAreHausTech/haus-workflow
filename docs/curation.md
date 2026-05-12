# Curation Policy

This file defines how external ideas become Haus-owned skill library content.

## Curation loop

1. Study source materials.
2. Extract candidate ideas.
3. Run gate checks.
4. Rewrite as Haus-owned guidance.
5. Record decision metadata.
6. Validate with catalog/recommender/apply tests.

## Gate checks

An idea is accepted only if all are true:

- fits Haus product goal (Claude-native workflow layer)
- improves Claude Code developer workflow
- can be rewritten as Haus-owned guidance
- supports minimal/progressive context
- maintainable without upstream sync dependence
- does not add runtime/framework/marketplace behavior
- does not pull unsupported stacks

## Source decision artifact

Decisions live in `library/curation/source-decisions.json`.
Schema lives in `library/curation/source-decisions.schema.json`.
Validator script: `yarn sources:decisions`.

Accepted ideas require:

- `idea`
- `target`
- `reason`
- `copied: false`
- `maintenanceRisk`
- `licenseAttributionConcern`
- `productFit`

## Copying and attribution policy

- No verbatim external skill text in shipping assets.
- No syncing external repos into runtime install path.
- Sources are reference/inspiration only.
- Keep enough metadata to audit legal/maintenance risk.
