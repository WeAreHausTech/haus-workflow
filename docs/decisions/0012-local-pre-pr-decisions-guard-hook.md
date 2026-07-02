# ADR-0012: Local pre-PR decisions guard hook

- **Status:** Accepted | **Date:** 2026-07-02

## Context

The ADR enforcement model (ADR-0008) has two layers: a `Stop` hook that
soft-drafts an ADR suggestion every turn, and a CI gate (`decisions-gate`,
opt-in per consumer project) that hard-blocks a merge. Neither catches a
decision-worthy change at the moment a PR is opened — the Stop hook is
easy to ignore, and CI only runs after the PR already exists. `haus-workflow-catalog`
ADR-0010 promotes the ADR skill and the CI gate template to catalog defaults for
the same reason: opt-in enforcement measurably under-delivers.

## Decision

Add `haus decisions guard --from-hook`, a new `PreToolUse` hook, as its own CLI
command rather than folding it into `haus guard bash`. `docs/security.md`
documents that `guard bash`/`guard file-access` mirror only the static
`DENY_COMMANDS`/`DENY_PATHS` tier 1:1 with `permissions.deny`; this check is a
dynamic, git-aware policy decision, not a deny-tier command match, so keeping it
separate preserves that invariant instead of conflating two different concerns
in one hook.

The hook no-ops on every `Bash` call except one matching `gh pr create`. When
matched, it resolves the current branch's base ref (`resolveBaseRef`: prefers
`origin/HEAD`, falls back to local `main`/`master`, returns `undefined` — fail
open — if none resolve), then runs the existing `runDecisionsCheck` engine (the
same one `haus decisions check` uses in CI) over `<base>...HEAD`. If the diff is
decision-worthy and unsatisfied, it denies the tool call via the same
`PreToolUse` deny-JSON contract `guard.ts` already used — extracted into a shared
`src/claude/hook-io.ts` so both hooks emit an identical, contract-critical shape
instead of two independently-maintained copies.

On a malformed hook payload, the guard fails **closed** (denies), matching
`guard.ts`'s existing behavior for the same failure mode. On an unresolvable
base branch, it fails **open** (allows) — an ambiguous repo shape is not
evidence of a missing ADR, and the CI gate remains as an independent backstop
for any PR that slips past the local check this way.

The new hook had to be registered in three separate places this repo already
tracks its canonical Claude Code hook set — `CANONICAL_HOOKS`
(`src/claude/load-hooks.ts`, used by `haus apply --write`'s self-check),
`library/global/settings-fragments/hooks.json` (used by `haus install`), and
`PROJECT_HOOK_FRAGMENTS` (`src/claude/merge-project-settings.ts`, used by
`haus apply --write`'s actual merge) — a pre-existing architectural duplication
this feature had to work around, not one it introduced. A new
`tests/hook-lists-parity.test.js` now asserts all three agree (with one
deliberate, explicitly-pinned exception: the global install fragment
intentionally omits the project-scoped `SessionStart`/`haus update` hook, since
that hook's own `--from-hook` guard only fires inside a haus-managed project and
would be surprising running on every Claude Code session machine-wide).

## Consequences

- `gh pr create` gains one extra `git log`/`git diff` round trip when the
  command matches — negligible next to the network calls `gh` itself makes.
- A future PR that updates only one or two of the three hook-tracking lists now
  fails `tests/hook-lists-parity.test.js` instead of silently drifting.
- Still not airtight: a PR opened via the GitHub web UI, another git client, or
  a human bypasses this local hook entirely and is only caught by the CI gate
  (where a consumer project has adopted it). This is an accepted, documented
  gap — see `haus-workflow-catalog` ADR-0010 — not a silent one.

## Alternatives considered

- **Fold the check into `guard bash`** — rejected; violates the documented
  deny-tier-only invariant for that hook and conflates security guarding with
  workflow policy.
- **Server-side-only enforcement (skip the local hook)** — rejected; leaves a
  slow feedback loop where the agent only learns about a missing ADR after CI
  runs on an already-open PR.
- **Automate GitHub branch protection so the CI gate is unbypassable** —
  deferred; needs repo-admin credentials haus does not assume it has, and is a
  distinct, explicitly out-of-scope change (see `haus-workflow-catalog` ADR-0010).
