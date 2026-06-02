import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadClaudeHooksSettings } from '../src/claude/load-hooks.js'

describe('loadClaudeHooksSettings', () => {
  it('keeps the canonical hooks', async () => {
    const s = await loadClaudeHooksSettings()
    assert.equal(s.hooks.UserPromptSubmit[0].hooks[0].command, 'haus context --from-hook || true')
    assert.equal(s.hooks.PreToolUse.length, 2)
  })

  it('includes permissions.deny with the NEVER rules (project-level deterministic layer)', async () => {
    const s = await loadClaudeHooksSettings()
    assert.ok(Array.isArray(s.permissions?.deny), 'permissions.deny should be present')
    assert.ok(s.permissions.deny.includes('Bash(rm -rf:*)'))
    assert.ok(s.permissions.deny.includes('Bash(git push --force:*)'))
    assert.ok(
      s.permissions.deny.some((r) => r.startsWith('Write(') && r.includes('.env')),
      'expected a Write deny for .env',
    )
  })
})
