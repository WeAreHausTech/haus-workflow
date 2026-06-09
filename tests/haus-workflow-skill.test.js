// tests/haus-workflow-skill.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SKILL = fs.readFileSync('library/global/skills/haus-workflow/SKILL.md', 'utf8')

test('setup delegates to the haus-setup command flow', () => {
  assert.ok(
    SKILL.includes('haus-setup.md'),
    'setup must point the agent at the haus-setup command file',
  )
})

test('setup produces project docs as part of the flow', () => {
  assert.ok(SKILL.includes('project docs'), 'setup must state that project docs are written')
})

test('setup still completes workflow-config.md', () => {
  assert.ok(
    SKILL.includes('workflow-config.md'),
    'setup must still fill workflow-config.md after the haus-setup flow',
  )
})

test('setup/init no longer maps to a bare `haus init` command', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`init`') && l.includes('`setup`'))
  assert.ok(aliasRow, 'aliases table must keep an init/setup row')
  assert.ok(
    !/\|\s*`haus init`\s*\|/.test(aliasRow),
    'the init/setup alias must not map to a bare `haus init` command',
  )
})
