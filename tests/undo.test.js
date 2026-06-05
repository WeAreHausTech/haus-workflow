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
})

test('undo noop when dirs missing', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-undo-empty-'))
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'undo', '--yes'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').includes('no haus-managed files'), true)
})
