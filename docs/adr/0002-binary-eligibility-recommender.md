# ADR-0002: Recommender uses binary eligibility

- **Status:** Accepted | **Date:** 2026-06-03

## Context

The recommender ranked catalog items with weighted bonuses/penalties, a numeric
`score`, derived `confidence`/`confidenceLevel`, an ecosystem-conflict penalty, a
role-only-bleed guard, and a `minScore` threshold. The scanner also produced a 0–0.99
detection `confidence` float. The weights were tuned by hand and hard to reason about:
a recommendation's presence depended on arithmetic no one could predict, and the
scores were never surfaced to users in a way that justified their complexity.

## Decision

Replace scoring with **binary eligibility**. An item is recommended iff it passes
every policy gate (unsupported stack, curated approval/risk, source trust, sensitive
content, required role, `requiresAny`) AND is a catalog default OR has ≥1 positive
match signal (role, stack, goal, package manager, config signal, changed file, or a
`deep:` signal from `deep-context.json`).

Removed: `score`, `scoreBreakdown`, `confidence`, `confidenceLevel`, the
ecosystem-conflict penalty (and `ecosystem.ts`), the role-only-bleed guard, `scoring.ts`,
and the scanner's `confidence` metric. `detectionStatus` + reasons carry the signal that
matters. `RecommendedItem` keeps `reasons[]` and `selectionMode` for transparency.

## Consequences

- Recommendations are predictable and explainable: each item lists why it matched.
- Policy gates (the correctness/security boundary) are unchanged.
- Token-budget rule selection ranks by match-signal count, not score.
- Legacy `recommendation.json` files with score/confidence are tolerated on read.

## Alternatives considered

- **Keep scoring, expose it better** — rejected; the complexity bought nothing users relied on.
- **Binary + derived confidence label** — rejected; reintroduces a ranking signal without a numeric basis.
