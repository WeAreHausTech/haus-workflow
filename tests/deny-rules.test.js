import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDenyRules } from '../src/security/deny-rules.js'
import { mergeDenyRules, stripHausDeny } from '../src/install/settings-merge.js'

describe('deny-rules: buildDenyRules', () => {
  it('derives a Bash prefix-deny rule for each deny-tier command', () => {
    const rules = buildDenyRules()
    assert.ok(rules.includes('Bash(git push --force:*)'))
    assert.ok(rules.includes('Bash(sudo:*)'))
    assert.ok(rules.includes('Bash(npm publish:*)'))
  })

  it('does NOT include ask-tier bash commands', () => {
    const rules = buildDenyRules()
    assert.ok(!rules.includes('Bash(rm -rf:*)'))
    assert.ok(!rules.includes('Bash(chown -R:*)'))
    assert.ok(!rules.includes('Bash(git reset --hard:*)'))
  })

  it('derives file-tool deny rules for deny-tier paths (pem, key, certs, etc.)', () => {
    const rules = buildDenyRules()
    assert.ok(rules.some((r) => r.startsWith('Read(') && r.includes('.pem')))
    assert.ok(rules.includes('Read(customer-data/**)'))
    assert.ok(rules.includes('Write(secrets/**)'))
  })

  it('does NOT deny .env, storage/logs, exports (they are ask-tier or dropped)', () => {
    const rules = buildDenyRules()
    assert.ok(!rules.some((r) => r.includes('.env')))
    assert.ok(!rules.some((r) => r.includes('storage/logs')))
    assert.ok(!rules.some((r) => r.includes('exports')))
  })

  it('does NOT include *.sql (dropped entirely)', () => {
    const rules = buildDenyRules()
    assert.ok(!rules.some((r) => r.includes('.sql')))
  })

  it('returns no duplicate rules', () => {
    const rules = buildDenyRules()
    assert.equal(rules.length, new Set(rules).size)
  })
})

describe('settings-merge: mergeDenyRules', () => {
  it('adds rules under permissions.deny and tracks them in _haus.denyRules', () => {
    const { settings, addedRules } = mergeDenyRules({}, ['Bash(rm -rf:*)', 'Write(.env:*)'])
    assert.deepEqual(addedRules, ['Bash(rm -rf:*)', 'Write(.env:*)'])
    assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf:*)', 'Write(.env:*)'])
    assert.deepEqual(settings._haus.denyRules, ['Bash(rm -rf:*)', 'Write(.env:*)'])
  })

  it('does not duplicate existing rules (idempotent)', () => {
    const first = mergeDenyRules({}, ['Bash(rm -rf:*)']).settings
    const { settings, addedRules } = mergeDenyRules(first, ['Bash(rm -rf:*)', 'Write(.env:*)'])
    assert.deepEqual(addedRules, ['Write(.env:*)'])
    assert.equal(settings.permissions.deny.filter((r) => r === 'Bash(rm -rf:*)').length, 1)
  })

  it('preserves user-defined deny rules and does not claim them as haus-owned', () => {
    const existing = { permissions: { deny: ['Bash(curl:*)'] } }
    const { settings } = mergeDenyRules(existing, ['Bash(rm -rf:*)'])
    assert.ok(settings.permissions.deny.includes('Bash(curl:*)'))
    assert.ok(settings.permissions.deny.includes('Bash(rm -rf:*)'))
    assert.ok(!settings._haus.denyRules.includes('Bash(curl:*)'))
  })

  it('preserves an existing permissions.allow block', () => {
    const existing = { permissions: { allow: ['Bash(haus doctor:*)'] } }
    const { settings } = mergeDenyRules(existing, ['Bash(rm -rf:*)'])
    assert.deepEqual(settings.permissions.allow, ['Bash(haus doctor:*)'])
  })

  // Regression: additive-only merge left stale haus rules in existing projects on
  // update (e.g. Read(.env)/Read(*.sql) stayed denied after the ask-tier release).
  // Reconcile must prune tracked rules no longer in the new build list.
  it('removes stale haus deny rules dropped from the new build list (reconcile)', () => {
    // Simulate an old install: haus tracked Read(.env)/Read(*.sql)/Edit(*.sql) + rm -rf.
    const old = mergeDenyRules({}, [
      'Bash(rm -rf:*)',
      'Read(.env)',
      'Read(*.sql)',
      'Edit(*.sql)',
    ]).settings
    // New release ships a different deny set (no .env/.sql).
    const { settings } = mergeDenyRules(old, ['Bash(sudo:*)', 'Read(*.pem)'])
    assert.ok(!settings.permissions.deny.includes('Read(.env)'), 'stale Read(.env) pruned')
    assert.ok(!settings.permissions.deny.includes('Read(*.sql)'), 'stale Read(*.sql) pruned')
    assert.ok(!settings.permissions.deny.includes('Edit(*.sql)'), 'stale Edit(*.sql) pruned')
    assert.ok(!settings.permissions.deny.includes('Bash(rm -rf:*)'), 'stale Bash(rm -rf:*) pruned')
    assert.deepEqual(settings.permissions.deny, ['Bash(sudo:*)', 'Read(*.pem)'])
    assert.deepEqual(settings._haus.denyRules, ['Bash(sudo:*)', 'Read(*.pem)'])
  })

  it('prunes stale haus rules but keeps user-authored rules on re-merge', () => {
    const old = mergeDenyRules({ permissions: { deny: ['Bash(my-own:*)'] } }, [
      'Read(.env)',
      'Bash(rm -rf:*)',
    ]).settings
    const { settings } = mergeDenyRules(old, ['Bash(sudo:*)'])
    assert.ok(settings.permissions.deny.includes('Bash(my-own:*)'), 'user rule kept')
    assert.ok(settings.permissions.deny.includes('Bash(sudo:*)'), 'new haus rule added')
    assert.ok(!settings.permissions.deny.includes('Read(.env)'), 'stale haus rule pruned')
    assert.ok(!settings.permissions.deny.includes('Bash(rm -rf:*)'), 'stale haus rule pruned')
  })

  it('dedupes pre-existing duplicate user rules (first occurrence wins)', () => {
    const existing = { permissions: { deny: ['Bash(dup:*)', 'Bash(dup:*)'] } }
    const { settings } = mergeDenyRules(existing, ['Bash(sudo:*)'])
    assert.equal(
      settings.permissions.deny.filter((r) => r === 'Bash(dup:*)').length,
      1,
      'duplicate user rule collapsed to one',
    )
    assert.deepEqual(settings.permissions.deny, ['Bash(dup:*)', 'Bash(sudo:*)'])
  })

  it('is idempotent across re-merges with the same build list', () => {
    const once = mergeDenyRules(
      { permissions: { deny: ['Bash(user:*)'] } },
      buildDenyRules(),
    ).settings
    const twice = mergeDenyRules(once, buildDenyRules()).settings
    assert.deepEqual(twice.permissions.deny, once.permissions.deny)
    assert.deepEqual(twice._haus.denyRules, once._haus.denyRules)
  })
})

describe('settings-merge: stripHausDeny', () => {
  it('removes only haus-added deny rules and the denyRules tracking key', () => {
    const merged = mergeDenyRules({ permissions: { deny: ['Bash(curl:*)'] } }, [
      'Bash(rm -rf:*)',
    ]).settings
    const stripped = stripHausDeny(merged)
    assert.deepEqual(stripped.permissions.deny, ['Bash(curl:*)'])
    assert.equal(stripped._haus?.denyRules, undefined)
  })

  it('no-ops when there are no haus deny rules', () => {
    const settings = { permissions: { deny: ['Bash(curl:*)'] } }
    const stripped = stripHausDeny(settings)
    assert.deepEqual(stripped, settings)
  })
})
