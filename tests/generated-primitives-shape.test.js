import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { execaSync } from 'execa'

process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

test('generated claude primitives stay compact routers', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'haus-generated-'))
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd })

  // Root CLAUDE.md is now canonical (P6); .claude/CLAUDE.md is no longer written
  const claudemd = fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8')
  const ruleHaus = fs.readFileSync(path.join(cwd, '.claude/rules/haus.md'), 'utf8')

  assert.equal(claudemd.length < 300, true, 'root CLAUDE.md import block should stay tiny')
  assert.equal(
    fs.existsSync(path.join(cwd, '.claude/CLAUDE.md')),
    false,
    '.claude/CLAUDE.md should not exist',
  )
  // Carries the "Driving haus" NL-trigger block (WS6), the folded security lines, and the
  // hand-edit guard — but must stay a compact router, not an essay.
  assert.equal(ruleHaus.length < 1000, true, 'haus rule should stay compact')
  assert.equal(
    fs.existsSync(path.join(cwd, '.claude/commands/haus-doctor.md')),
    false,
    'the standalone haus-doctor.md stub is no longer written — everything routes through /haus-workflow',
  )
})
