import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAllowRules } from '../src/install/allow-rules.js'
import {
  mergeAllowRules,
  mergeDenyRules,
  mergeHooks,
  stripHausAllow,
} from '../src/install/settings-merge.js'

describe('allow-rules: buildAllowRules', () => {
  it('scopes each haus subcommand as a Bash prefix-allow, never a blanket Bash(haus:*)', () => {
    const rules = buildAllowRules()
    assert.ok(rules.includes('Bash(haus setup-project:*)'))
    assert.ok(rules.includes('Bash(haus apply:*)'))
    assert.ok(rules.includes('Bash(haus doctor:*)'))
    assert.ok(rules.includes('Bash(haus scan:*)'))
    assert.ok(rules.includes('Bash(haus recommend:*)'))
    assert.ok(!rules.includes('Bash(haus:*)'), 'must not be a blanket allow')
  })

  it('returns no duplicate rules', () => {
    const rules = buildAllowRules()
    assert.equal(rules.length, new Set(rules).size)
  })
})

describe('settings-merge: mergeAllowRules', () => {
  it('adds rules under permissions.allow and tracks them in _haus.allowRules', () => {
    const { settings, addedRules } = mergeAllowRules({}, [
      'Bash(haus doctor:*)',
      'Bash(haus scan:*)',
    ])
    assert.deepEqual(addedRules, ['Bash(haus doctor:*)', 'Bash(haus scan:*)'])
    assert.deepEqual(settings.permissions.allow, ['Bash(haus doctor:*)', 'Bash(haus scan:*)'])
    assert.deepEqual(settings._haus.allowRules, ['Bash(haus doctor:*)', 'Bash(haus scan:*)'])
  })

  it('does not duplicate existing rules (idempotent)', () => {
    const first = mergeAllowRules({}, ['Bash(haus doctor:*)']).settings
    const { settings, addedRules } = mergeAllowRules(first, [
      'Bash(haus doctor:*)',
      'Bash(haus scan:*)',
    ])
    assert.deepEqual(addedRules, ['Bash(haus scan:*)'])
    assert.equal(settings.permissions.allow.filter((r) => r === 'Bash(haus doctor:*)').length, 1)
  })

  it('preserves user-defined allow rules and does not claim them as haus-owned', () => {
    const existing = { permissions: { allow: ['Bash(npm test:*)'] } }
    const { settings } = mergeAllowRules(existing, ['Bash(haus doctor:*)'])
    assert.ok(settings.permissions.allow.includes('Bash(npm test:*)'))
    assert.ok(settings.permissions.allow.includes('Bash(haus doctor:*)'))
    assert.ok(!settings._haus.allowRules.includes('Bash(npm test:*)'))
  })

  it('preserves an existing permissions.deny block', () => {
    const existing = { permissions: { deny: ['Bash(rm -rf:*)'] } }
    const { settings } = mergeAllowRules(existing, ['Bash(haus doctor:*)'])
    assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf:*)'])
  })

  it('survives a deny merge then allow merge (cross-tracking order-independent)', () => {
    const afterDeny = mergeDenyRules({}, ['Bash(rm -rf:*)']).settings
    const { settings } = mergeAllowRules(afterDeny, ['Bash(haus doctor:*)'])
    assert.deepEqual(settings._haus.denyRules, ['Bash(rm -rf:*)'])
    assert.deepEqual(settings._haus.allowRules, ['Bash(haus doctor:*)'])
  })

  it('survives a hooks merge then allow merge (preserves hook tracking)', () => {
    const afterHooks = mergeHooks({}, [
      { id: 'hook.x', gate: 'keep', event: 'PreToolUse', command: 'haus guard bash --from-hook' },
    ]).settings
    const { settings } = mergeAllowRules(afterHooks, ['Bash(haus doctor:*)'])
    assert.deepEqual(settings._haus.hooks, ['hook.x'])
    assert.deepEqual(settings._haus.allowRules, ['Bash(haus doctor:*)'])
  })
})

describe('settings-merge: stripHausAllow', () => {
  it('removes only haus-added allow rules and the allowRules tracking key', () => {
    const merged = mergeAllowRules({ permissions: { allow: ['Bash(npm test:*)'] } }, [
      'Bash(haus doctor:*)',
    ]).settings
    const stripped = stripHausAllow(merged)
    assert.deepEqual(stripped.permissions.allow, ['Bash(npm test:*)'])
    assert.equal(stripped._haus?.allowRules, undefined)
  })

  it('keeps _haus when deny rules remain after stripping allow', () => {
    const afterDeny = mergeDenyRules({}, ['Bash(rm -rf:*)']).settings
    const merged = mergeAllowRules(afterDeny, ['Bash(haus doctor:*)']).settings
    const stripped = stripHausAllow(merged)
    assert.deepEqual(stripped._haus.denyRules, ['Bash(rm -rf:*)'])
    assert.equal(stripped._haus.allowRules, undefined)
  })

  it('no-ops when there are no haus allow rules', () => {
    const settings = { permissions: { allow: ['Bash(npm test:*)'] } }
    const stripped = stripHausAllow(settings)
    assert.deepEqual(stripped, settings)
  })
})
