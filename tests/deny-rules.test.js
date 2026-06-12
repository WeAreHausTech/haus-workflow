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
