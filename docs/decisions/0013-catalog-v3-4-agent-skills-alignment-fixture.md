# ADR-0013: Catalog v3.4.0 fixture sync — agent-skills-library alignment

- **Status:** Accepted | **Date:** 2026-07-03

## Context

Catalog release `v3.4.0` (PR
[#46](https://github.com/WeAreHausTech/haus-workflow-catalog/pull/46)) landed the
agent-skills-library alignment: 28 gross new items, 3 removed, net 94 → 119. The
pull-based `sync-catalog-from-release` workflow vendors `library/catalog/manifest.json`,
`validation-rules.json`, and `decisions-triggers.json` from the latest catalog tag.

This bump crosses the decision gate's `minLinesChanged` threshold. The change is
**data-only** from the CLI's perspective: no new `CatalogItem` fields, no new
validator logic, no install-path changes (LICENSE bundling and non-MIT licenses
already flow through existing copy-selected install — verified in
`docs/plans/2026-07-03-agent-skills-library-alignment-followup.md` findings 1–2).

Downstream code updates in the same PR: retire dead `nx21` hardcoded recommender
gate, retarget `turbo-monorepo-patterns` → `haus.turborepo-turborepo`, and fix
regression tests that asserted against removed catalog ids.

## Decision

1. **Accept the `v3.4.0` vendored fixture sync** as the new bundled catalog
   baseline for this CLI release line.
2. **Update recommender hardcoded role gates and regression tests** in the same
   PR so CI stays green — do not merge fixture-only with failing tests.
3. **Record this ADR** to satisfy `decisions-gate` for the large manifest diff;
   catalog-side policy ADRs (e.g. ADR-0009 GPL, catalog ADR-0011 license
   verification) remain in `haus-workflow-catalog` — this ADR covers only the
   CLI fixture propagation decision.

## Consequences

- `library/catalog/manifest.json` reflects 119 items; `contract-check` BP#1/BP#1b
  pass once merged.
- Removed ids (`haus.nx-monorepo-patterns`, `haus.turbo-monorepo-patterns`,
  `haus.expo-react-native-patterns`) no longer appear in production recommend
  output; tests and synthetic fixtures updated accordingly.
- Future catalog bumps of similar size should continue pairing fixture sync PRs
  with a short ADR when the decision gate triggers.
