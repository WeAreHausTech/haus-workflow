import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

test('undo --yes removes haus-managed files and preserves user-owned .claude content', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-undo-'))
  mkdirSync(path.join(temp, '.claude/skills/user-skill'), { recursive: true })
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(path.join(temp, '.claude/skills/user-skill/SKILL.md'), '# user skill')
  writeFileSync(path.join(temp, '.haus-workflow/context-map.json'), '{}')
  writeFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), '[]')
  mkdirSync(path.join(temp, '.claude/rules'), { recursive: true })
  writeFileSync(path.join(temp, '.claude/rules/haus.md'), 'haus rule')
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'undo', '--yes'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal(fs.existsSync(path.join(temp, '.claude/skills/user-skill/SKILL.md')), true)
  assert.equal(fs.existsSync(path.join(temp, '.claude/rules/haus.md')), false)
  assert.equal(fs.existsSync(path.join(temp, '.haus-workflow/haus.lock.json')), false)
  assert.equal(fs.existsSync(path.join(temp, '.haus-workflow/context-map.json')), true)
  const backupDir = path.join(temp, '.haus-workflow/backups')
  assert.equal(fs.existsSync(backupDir), true)
  const undoBackups = fs.readdirSync(backupDir).filter((name) => name.startsWith('undo-'))
  assert.ok(undoBackups.length > 0, 'undo backup directory should be created')
  const backedRule = path.join(backupDir, undoBackups[0], '.claude/rules/haus.md')
  assert.equal(fs.existsSync(backedRule), true)
})

// Regression: stripHausHooks deletes the whole _haus namespace, so it MUST run last
// in the strip chain. If it runs first, the deny/allow/ask strips see no ledger and
// no-op, orphaning haus permission rules in the user's settings.json forever.
test('undo --yes strips haus deny/allow/ask rules and preserves user rules', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-undo-rules-'))
  mkdirSync(path.join(temp, '.claude'), { recursive: true })
  const settings = {
    permissions: {
      deny: ['Bash(my-own:*)', 'Bash(sudo:*)'],
      allow: ['Bash(haus doctor:*)'],
      ask: ['Bash(rm -rf:*)'],
    },
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'haus guard bash --from-hook' }] },
      ],
    },
    _haus: {
      hooks: ['haus.guard-bash'],
      hookCommands: ['haus guard bash --from-hook'],
      denyRules: ['Bash(sudo:*)'],
      allowRules: ['Bash(haus doctor:*)'],
      askRules: ['Bash(rm -rf:*)'],
    },
  }
  writeFileSync(path.join(temp, '.claude/settings.json'), JSON.stringify(settings, null, 2))

  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'undo', '--yes'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)

  const after = JSON.parse(fs.readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))
  // Haus rules gone from all three arrays (allow/ask arrays held only haus rules,
  // so they are deleted entirely — normalize with ?? [] before checking).
  assert.equal(
    (after.permissions?.deny ?? []).includes('Bash(sudo:*)'),
    false,
    'haus deny rule removed',
  )
  assert.equal(
    (after.permissions?.allow ?? []).includes('Bash(haus doctor:*)'),
    false,
    'haus allow rule removed',
  )
  assert.equal(
    (after.permissions?.ask ?? []).includes('Bash(rm -rf:*)'),
    false,
    'haus ask rule removed',
  )
  // User's own deny rule preserved.
  assert.equal(
    (after.permissions?.deny ?? []).includes('Bash(my-own:*)'),
    true,
    'user deny rule preserved',
  )
  // Ledger and hooks gone.
  assert.equal(after._haus, undefined, '_haus namespace removed')
})

test('undo noop when dirs missing', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-undo-empty-'))
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'undo', '--yes'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').includes('no haus-managed files'), true)
})
