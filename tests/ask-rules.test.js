import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAskRules } from '../src/security/ask-rules.js'
import { mergeAskRules, stripHausAsk } from '../src/install/settings-merge.js'

describe('ask-rules: buildAskRules', () => {
  it('derives a Bash prefix-ask rule for each ask-tier command', () => {
    const rules = buildAskRules()
    assert.ok(rules.includes('Bash(rm -rf:*)'))
    assert.ok(rules.includes('Bash(chown -R:*)'))
    assert.ok(rules.includes('Bash(git reset --hard:*)'))
    assert.ok(rules.includes('Bash(docker system prune:*)'))
    assert.ok(rules.includes('Bash(php artisan migrate --force:*)'))
  })

  it('includes Edit+Write for .env and .env.*', () => {
    const rules = buildAskRules()
    assert.ok(rules.includes('Edit(.env)'))
    assert.ok(rules.includes('Write(.env)'))
    assert.ok(rules.includes('Edit(.env.*)'))
    assert.ok(rules.includes('Write(.env.*)'))
    // Read(.env) is NOT in ask — STRYK removes it entirely
    assert.ok(!rules.includes('Read(.env)'))
    assert.ok(!rules.includes('Read(.env.*)'))
  })

  it('includes Edit+Write for storage/logs and exports (Read is dropped)', () => {
    const rules = buildAskRules()
    assert.ok(rules.includes('Edit(storage/logs/**)'))
    assert.ok(rules.includes('Write(storage/logs/**)'))
    assert.ok(!rules.includes('Read(storage/logs/**)'))
    assert.ok(rules.includes('Edit(exports/**)'))
    assert.ok(rules.includes('Write(exports/**)'))
    assert.ok(!rules.includes('Read(exports/**)'))
  })

  it('includes Read+Edit+Write for dump/backup/bak/uploads', () => {
    const rules = buildAskRules()
    for (const pattern of ['*.dump', '*.backup', '*.bak', 'wp-content/uploads/**', 'uploads/**']) {
      assert.ok(rules.includes(`Read(${pattern})`), `missing Read(${pattern})`)
      assert.ok(rules.includes(`Edit(${pattern})`), `missing Edit(${pattern})`)
      assert.ok(rules.includes(`Write(${pattern})`), `missing Write(${pattern})`)
    }
  })

  it('does NOT include deny-tier commands', () => {
    const rules = buildAskRules()
    assert.ok(!rules.includes('Bash(sudo:*)'))
    assert.ok(!rules.includes('Bash(git push --force:*)'))
    assert.ok(!rules.includes('Bash(npm publish:*)'))
  })

  it('returns no duplicate rules', () => {
    const rules = buildAskRules()
    assert.equal(rules.length, new Set(rules).size)
  })
})

describe('settings-merge: mergeAskRules', () => {
  it('adds rules under permissions.ask and tracks them in _haus.askRules', () => {
    const { settings, addedRules } = mergeAskRules({}, ['Bash(rm -rf:*)', 'Edit(.env)'])
    assert.deepEqual(addedRules, ['Bash(rm -rf:*)', 'Edit(.env)'])
    assert.deepEqual(settings.permissions.ask, ['Bash(rm -rf:*)', 'Edit(.env)'])
    assert.deepEqual(settings._haus.askRules, ['Bash(rm -rf:*)', 'Edit(.env)'])
  })

  it('does not duplicate existing rules (idempotent)', () => {
    const first = mergeAskRules({}, ['Bash(rm -rf:*)']).settings
    const { settings, addedRules } = mergeAskRules(first, ['Bash(rm -rf:*)', 'Edit(.env)'])
    assert.deepEqual(addedRules, ['Edit(.env)'])
    assert.equal(settings.permissions.ask.filter((r) => r === 'Bash(rm -rf:*)').length, 1)
  })

  it('preserves user-defined ask rules and does not claim them as haus-owned', () => {
    const existing = { permissions: { ask: ['Bash(curl:*)'] } }
    const { settings } = mergeAskRules(existing, ['Bash(rm -rf:*)'])
    assert.ok(settings.permissions.ask.includes('Bash(curl:*)'))
    assert.ok(settings.permissions.ask.includes('Bash(rm -rf:*)'))
    assert.ok(!settings._haus.askRules.includes('Bash(curl:*)'))
  })

  it('preserves existing permissions.deny and permissions.allow blocks', () => {
    const existing = {
      permissions: { deny: ['Bash(sudo:*)'], allow: ['Bash(haus doctor:*)'] },
    }
    const { settings } = mergeAskRules(existing, ['Bash(rm -rf:*)'])
    assert.deepEqual(settings.permissions.deny, ['Bash(sudo:*)'])
    assert.deepEqual(settings.permissions.allow, ['Bash(haus doctor:*)'])
  })
})

describe('settings-merge: stripHausAsk', () => {
  it('removes only haus-added ask rules and the askRules tracking key', () => {
    const merged = mergeAskRules({ permissions: { ask: ['Bash(curl:*)'] } }, [
      'Bash(rm -rf:*)',
    ]).settings
    const stripped = stripHausAsk(merged)
    assert.deepEqual(stripped.permissions.ask, ['Bash(curl:*)'])
    assert.equal(stripped._haus?.askRules, undefined)
  })

  it('no-ops when there are no haus ask rules', () => {
    const settings = { permissions: { ask: ['Bash(curl:*)'] } }
    const stripped = stripHausAsk(settings)
    assert.deepEqual(stripped, settings)
  })

  it('cleans up empty permissions.ask after stripping all haus ask rules', () => {
    const merged = mergeAskRules({}, ['Bash(rm -rf:*)']).settings
    const stripped = stripHausAsk(merged)
    assert.equal(stripped.permissions?.ask, undefined)
  })
})
