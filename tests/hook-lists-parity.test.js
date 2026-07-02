import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { loadClaudeHooksSettings } from '../src/claude/load-hooks.js'
import { PROJECT_HOOK_FRAGMENTS } from '../src/claude/merge-project-settings.js'

/**
 * Cross-list parity for the three places this repo independently lists Claude
 * Code hooks:
 *   1. CANONICAL_HOOKS (src/claude/load-hooks.ts)      — `haus apply --write` (project)
 *   2. PROJECT_HOOK_FRAGMENTS (src/claude/merge-project-settings.ts) — project settings.json merge
 *   3. library/global/settings-fragments/hooks.json    — `haus install` (global ~/.claude/settings.json)
 *
 * (1) and (2) both describe the *project*-scoped hook set and must match exactly.
 *
 * (3) is deliberately a SUBSET, not a mirror: it also gets the global hooks.json
 * `haus decisions guard` / `hook.decisions.guard` id-naming path exercised by
 * load-hooks.test.js's "no memory hook" check, but it excludes `haus update
 * --from-hook` (SessionStart) on purpose. That hook's own docs (src/commands/
 * update.ts, docs/cli.md) state it "confirms this is a haus project" via the
 * per-project lockfile before doing anything — a global SessionStart hook would
 * fire on every Claude Code session on the machine, including non-haus
 * projects, which contradicts its own scoping. See commit 5dce24c, which added
 * the hook to CANONICAL_HOOKS and PROJECT_HOOK_FRAGMENTS only, and explicitly
 * checked "matcher parity between the two hardcoded hook-fragment lists" —
 * i.e. only those two, not the global JSON fragment.
 *
 * If a future PR adds/removes a hook in only one or two of these three lists,
 * these tests fail with a diagnostic naming the missing/extra command(s).
 */

/** Flattens a ClaudeHooksSettings.hooks map into a Set of `event::matcher::command` triples. */
function flattenCanonicalHooks(hooks) {
  const out = new Set()
  for (const [event, entries] of Object.entries(hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const h of entry.hooks ?? []) {
        out.add(`${event}::${entry.matcher ?? ''}::${h.command}`)
      }
    }
  }
  return out
}

/** Flattens a HookFragment[] (the shape used by PROJECT_HOOK_FRAGMENTS and the JSON fragment). */
function flattenFragmentList(fragments) {
  return new Set(fragments.map((f) => `${f.event}::${f.matcher ?? ''}::${f.command}`))
}

function diffSets(a, b) {
  const onlyInA = [...a].filter((x) => !b.has(x))
  const onlyInB = [...b].filter((x) => !a.has(x))
  return { onlyInA, onlyInB }
}

describe('hook list cross-source parity', () => {
  it('CANONICAL_HOOKS and PROJECT_HOOK_FRAGMENTS describe the same project hook set', async () => {
    const canonical = await loadClaudeHooksSettings()
    const canonicalSet = flattenCanonicalHooks(canonical.hooks)
    const projectSet = flattenFragmentList(PROJECT_HOOK_FRAGMENTS)

    const { onlyInA, onlyInB } = diffSets(canonicalSet, projectSet)

    assert.deepEqual(
      onlyInA,
      [],
      `CANONICAL_HOOKS has hook(s) missing from PROJECT_HOOK_FRAGMENTS: ${onlyInA.join(', ')}. ` +
        'Add the matching entry to PROJECT_HOOK_FRAGMENTS in src/claude/merge-project-settings.ts.',
    )
    assert.deepEqual(
      onlyInB,
      [],
      `PROJECT_HOOK_FRAGMENTS has hook(s) missing from CANONICAL_HOOKS: ${onlyInB.join(', ')}. ` +
        'Add the matching entry to CANONICAL_HOOKS in src/claude/load-hooks.ts.',
    )
  })

  it('global install fragment (hooks.json) is a subset of the project hook set', async () => {
    const canonical = await loadClaudeHooksSettings()
    const canonicalSet = flattenCanonicalHooks(canonical.hooks)

    const fragmentFile = JSON.parse(
      fs.readFileSync(path.resolve('library/global/settings-fragments/hooks.json'), 'utf8'),
    )
    const keepFragments = fragmentFile.hooks.filter((h) => h.gate === 'keep')
    const globalSet = flattenFragmentList(keepFragments)

    const { onlyInB: extraInGlobal } = diffSets(canonicalSet, globalSet)

    assert.deepEqual(
      extraInGlobal,
      [],
      `library/global/settings-fragments/hooks.json has hook(s) not present in CANONICAL_HOOKS: ` +
        `${extraInGlobal.join(', ')}. Every command shipped globally must also exist in the ` +
        'canonical project hook set (src/claude/load-hooks.ts) — the global fragment must stay ' +
        'a subset, not diverge with its own commands.',
    )

    // Known, deliberate gap: `haus update --from-hook` (SessionStart) is project-only.
    // It reads the project lockfile to confirm "this is a haus project" before doing
    // anything (see src/commands/update.ts) — a global SessionStart hook would fire on
    // every Claude Code session on the machine, not just haus-managed projects, which
    // contradicts that scoping. If this ever needs to become a three-way exact match,
    // update this test deliberately rather than deleting the assertion above.
    const missingFromGlobal = [...canonicalSet].filter((x) => !globalSet.has(x))
    assert.deepEqual(
      missingFromGlobal,
      ['SessionStart::*::haus update --from-hook'],
      'Expected the global hooks.json fragment to omit exactly the project-scoped ' +
        `SessionStart update-check hook. Actual gap vs. CANONICAL_HOOKS: ${missingFromGlobal.join(', ')}. ` +
        'If this list changed, either sync hooks.json to close an unintended gap, or update this ' +
        'assertion if the gap is now intentionally different.',
    )
  })
})
