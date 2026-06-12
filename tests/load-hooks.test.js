import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { loadClaudeHooksSettings } from '../src/claude/load-hooks.js'

describe('loadClaudeHooksSettings', () => {
  it('keeps the canonical PreToolUse guard hooks only', async () => {
    const s = await loadClaudeHooksSettings()
    assert.equal(s.hooks.UserPromptSubmit, undefined)
    assert.equal(s.hooks.PreToolUse.length, 2)
    assert.equal(s.hooks.PreToolUse[0].hooks[0].command, 'haus guard file-access --from-hook')
    assert.equal(s.hooks.PreToolUse[1].hooks[0].command, 'haus guard bash --from-hook')
  })

  it('bundled install fragment installs no removed CLI commands', () => {
    // Regression: the install path merges library/global/settings-fragments/hooks.json.
    // It must stay in sync with CANONICAL_HOOKS — a stale `haus memory inject` entry
    // would install a hook calling a removed command (hook-time errors).
    const fragment = JSON.parse(
      fs.readFileSync(path.resolve('library/global/settings-fragments/hooks.json'), 'utf8'),
    )
    for (const hook of fragment.hooks) {
      assert.ok(!/\bmemory\b/.test(hook.command), `unexpected memory hook: ${hook.command}`)
    }
  })

  it('includes permissions.deny with hard-deny rules only', async () => {
    const s = await loadClaudeHooksSettings()
    assert.ok(Array.isArray(s.permissions?.deny), 'permissions.deny should be present')
    assert.ok(s.permissions.deny.includes('Bash(git push --force:*)'))
    assert.ok(s.permissions.deny.includes('Bash(sudo:*)'))
    // ask-tier commands must NOT be in deny
    assert.ok(!s.permissions.deny.includes('Bash(rm -rf:*)'), 'rm -rf must not be in deny')
    // .env is ask-tier, not deny-tier
    assert.ok(!s.permissions.deny.some((r) => r.includes('.env')), '.env rules must not be in deny')
  })

  it('includes permissions.ask with ask-tier rules', async () => {
    const s = await loadClaudeHooksSettings()
    assert.ok(Array.isArray(s.permissions?.ask), 'permissions.ask should be present')
    assert.ok(s.permissions.ask.includes('Bash(rm -rf:*)'), 'rm -rf should be in ask')
    assert.ok(
      s.permissions.ask.some((r) => r.startsWith('Write(') && r.includes('.env')),
      'expected a Write ask for .env',
    )
  })
})
