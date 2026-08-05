# ADR-0022: Recommender gate-breakdown schema and near-miss semantics

- **Status:** Accepted
- **Date:** 2026-08-05
- **Decided by:** Aniisa Bihi (draft by Claude Code)
- **Affects:** `src/recommender/recommend.ts`, `src/recommender/explain-recommendation.ts`, `src/types.ts` (`Recommendation` schema)
- **Related:** [PR #192](https://github.com/WeAreHausTech/haus-workflow/pull/192), [docs/plans/cli-audit-section-8-and-prune.md](../plans/cli-audit-section-8-and-prune.md) (Task E), CLI audit §8 item 4

## Context

`recommend()`'s eligibility loop evaluated policy/eligibility gates sequentially and
`continue`d at the first failure (`former-id`, `invalid-source`, `unsupported-policy`,
`deprecated`, curated/risk gates, `sensitive-policy`, `source-trust`/`source-approval`,
required-role checks, `requiresAny`). This meant a skipped item only ever reported
_one_ reason, with no way to tell whether it was one signal away from qualifying or
fundamentally blocked by several gates at once. `src/recommender/` is named
highest-stakes in `workflow-config.md` — "a wrong gate silently drops or leaks a
context asset" — so any change here needs an explicit outcome contract, not an
assumption.

## Decision

Evaluate every named gate for every item (no early exit), and add two additive,
optional fields to the existing `Recommendation` schema:

- `recommended[].gates` / `skipped[].gates`: `Array<{ name: string; passed: boolean }>`
  — the full per-gate breakdown, in the same order the original sequential checks ran.
- A gate is only _included_ in the array when it is structurally applicable to the
  item (e.g. `curated-not-approved`/`curated-risk-blocked` only for `source: curated`
  items; `required-role-missing:*` only for the two hardcoded ids that carry that
  gate). An inapplicable gate is omitted, not recorded as vacuously passed — so
  near-miss counting only reflects gates that could actually have failed.
- The pre-existing `skipReasons[0]` (first-failure code/message/signal) is left
  completely unchanged — it is derived by taking the first `!passed` entry from the
  same ordered `gates` array, so legacy consumers of `skipReasons` see zero diff.
- `explain-recommendation.ts` surfaces a `nearMiss` list: skipped items with
  _exactly one_ failing gate, naming that gate. Items failing two or more gates are
  excluded from `nearMiss` (they need more than one fix, so "one gate away" would be
  misleading). Legacy `recommendation.json` files with no `gates` array produce an
  empty `nearMiss` list rather than guessing.

## Motivation (why)

- Additive-only fields mean no existing consumer (CLI output, `explain`, tests) can
  break — this was a hard constraint from the highest-stakes designation.
- Evaluating gates independently (rather than nesting them inside the original
  early-return `if`/`continue` blocks) is possible because every gate is a pure
  function of the catalog item + context — none of them mutate state that a later
  gate depends on. This let the restructure add full visibility without touching the
  decision logic that determines final recommend/skip.
- One side effect worth naming explicitly: gates that were previously unreachable
  because an earlier gate `continue`d first (e.g. `source-trust`/`source-approval`
  for a `curated` item that already failed `curated-not-approved`) are now evaluated
  and can appear as _additional_ failing entries in `gates`, even though only one
  code ever appeared in the legacy `skipReasons`. This is intentional — it is the
  whole point of the per-gate breakdown — but it means an item's `gates` failing-count
  can be higher than "1" even when it was always going to be skipped for one obvious
  reason.

## Alternatives considered

- **Compute near-miss by re-running the gate checks after the fact, outside
  `recommend()`.** Rejected: would duplicate the gate logic in a second place,
  violating the single-source-of-truth pattern this codebase already uses for
  orphan-detection (`orphaned-items.ts`) and diffing (`src/utils/diff.ts`).
- **Only evaluate the gates enumerated as "policy gates" and treat `requiresAny` and
  required-role checks separately.** Rejected: `requiresAny`/required-role gates are
  exactly the kind of "one signal away" case the near-miss feature exists for (e.g. a
  Svelte skill skipped only because `svelte` isn't detected yet) — excluding them
  would gut the feature's most useful cases.
- **Suppress inapplicable gates as `passed: true` instead of omitting them.** Rejected:
  would silently pad every item's passing-gate count and make near-miss counting
  (`failing.length === 1`) unreliable — e.g. a non-curated item would show 2 vacuous
  "passes" for gates that never applied to it.

## Consequences

- `recommendation.json` grows two new optional array fields; disk size increase is
  bounded (one small object per applicable gate, typically 4–8 entries per item).
- `haus explain`'s output gains a `nearMiss` section — the setup UX can now surface
  "add `svelte` as a dependency to unlock this skill"-style guidance without a second
  eligibility pass.
- Any future gate must be added in the same ordered list inside `buildGateChecks()`
  (`src/recommender/recommend.ts`) to stay covered by the breakdown and near-miss
  logic — a gate implemented as a bare inline `if`/`continue` outside that function
  would silently fall back to the old one-reason-only behavior for that gate.
