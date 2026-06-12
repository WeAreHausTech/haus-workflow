# Plan: reconcile haus-managed permission rules on update/apply

## Bug

`mergeDenyRules`/`mergeAllowRules`/`mergeAskRules` are **additive-only**: they append
rules missing from the array but never remove haus-managed rules that were dropped
from (or moved between) the build lists. So existing projects upgraded to the ask-tier
release keep stale deny rules (`Read(.env)`, `Read(*.sql)`, `Edit(*.sql)`) — `.env` stays
deny-Read (defeating the STRYK intent) and `*.sql` stays denied forever. `update` and
`apply` both re-merge via these functions, so neither truly updates the permission list.

Reproduced: old-style settings.json (deny incl. `Read(.env)`/`*.sql`, `_haus.denyRules`
tracking them) → `apply --write` → ask tier added BUT stale deny rules remain.

## Fix

Callers always pass the **complete** current haus-managed set for the tier
(`buildDenyRules()` etc.). So the merge should _reconcile_ the haus-owned slice to
exactly that set, leaving user-authored rules untouched.

Reconcile semantics (per tier), given `existing` array, `prevTracked` (`_haus.<tier>Rules`),
`newRules`:

- `userRules = existing \ prevTracked` — never touched (preserves user rules)
- `tracked = newRules \ userRules` — haus claims only rules the user didn't already have
- `finalArray = userRules ++ tracked` — deduped, user order preserved, build order for haus
- `_haus.<tier>Rules = tracked`

Properties: idempotent (same list twice → no change); removes stale tracked rules absent
from `newRules`; never removes/claims user rules; handles tier moves (a rule dropped from
deny + added to ask reconciles correctly in each array).

## Tasks

### T1 — reconcile helper + refactor merges

- **File:** `src/install/settings-merge.ts`
- Add `reconcileManagedRules(existing, prevTracked, newRules)` → `{ rules, tracked, added, removed }`.
- Rewrite `mergeDenyRules`/`mergeAllowRules`/`mergeAskRules` to use it (keep signatures +
  `{ settings, addedRules }` return for callers).
- **Acceptance:** re-merge with a shortened `newRules` drops the stale tracked rules;
  user rules preserved; idempotent.
- **Verify:** `tests/deny-rules.test.js`, `tests/ask-rules.test.js`.

### T2 — regression tests

- **Files:** `tests/deny-rules.test.js`, `tests/ask-rules.test.js`, `tests/install-roundtrip.test.js`
- Add: "re-merge with changed build list prunes stale haus rules, keeps user rules."
- Add an upgrade-shaped case: seed old `_haus.denyRules` incl. `Read(.env)`/`Read(*.sql)`,
  re-merge with the new `buildDenyRules()` → those gone, `.env` not denied, ask present.
- **Verify:** `yarn test`.

### T3 — full gate

- `yarn verify` green.

## Out of scope

The `catalogItems is not iterable` seen in the local repro (empty fixture cache) — unrelated.
Guard/scanner logic unchanged. No change to build lists themselves.
