// tests/haus-workflow-skill.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SKILL = fs.readFileSync('library/global/skills/haus-workflow/SKILL.md', 'utf8')

test('haus-workflow SKILL.md keeps the required setup-flow references', () => {
  // Guards the high-stakes global skill: it must route to haus-setup, write
  // project docs, and complete workflow-config.md.
  for (const phrase of ['haus-setup.md', 'project docs', 'workflow-config.md']) {
    assert.ok(SKILL.includes(phrase), `SKILL.md must reference: ${phrase}`)
  }
})

test('setup/init alias no longer maps to a bare `haus init` command', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`init`') && l.includes('`setup`'))
  assert.ok(aliasRow, 'aliases table must keep an init/setup row')
  assert.ok(
    !/\|\s*`haus init`\s*\|/.test(aliasRow),
    'the init/setup alias must not map to a bare `haus init` command',
  )
})
