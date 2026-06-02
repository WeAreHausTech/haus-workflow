import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { loadClaudeHooksSettings } from '../src/claude/load-hooks.js'

describe('loadClaudeHooksSettings', () => {
  it('keeps the canonical hooks', async () => {
    const s = await loadClaudeHooksSettings()
    assert.equal(s.hooks.UserPromptSubmit[0].hooks[0].command, 'haus context --from-hook || true')
    assert.equal(s.hooks.UserPromptSubmit[0].hooks.length, 1)
    assert.equal(s.hooks.PreToolUse.length, 2)
  })

  it('bundled install fragment installs no removed CLI commands', () => {
    // Regression: the install path merges library/global/settings-fragments/hooks.json.
    // It must stay in sync with CANONICAL_HOOKS — a stale `haus memory inject` entry
    // would install a hook calling a removed command (hook-time errors).
    const fragment = JSON.parse(
      fs.readFileSync(
        path.resolve('library/global/settings-fragments/hooks.json'),
        'utf8',
      ),
    )
    for (const hook of fragment.hooks) {
      assert.ok(!/\bmemory\b/.test(hook.command), `unexpected memory hook: ${hook.command}`)
    }
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
