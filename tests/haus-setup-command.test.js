// tests/haus-setup-command.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CMD = fs.readFileSync('library/global/commands/haus-setup.md', 'utf8')
const MANIFEST = JSON.parse(fs.readFileSync('library/catalog/manifest.json', 'utf8'))

function docsSkillBasename() {
  const entry = MANIFEST.items.find((i) => i.id === 'haus.writing-documentation')
  assert.ok(entry, 'writing-documentation must exist in the catalog manifest')
  return path.basename(entry.path) // skills/haus-owned/general/writing-documentation -> writing-documentation
}

test('haus-setup references the installed docs skill at the manifest-derived path', () => {
  const expectedPath = `.claude/skills/${docsSkillBasename()}/SKILL.md`
  assert.ok(CMD.includes(expectedPath), `command should tell the agent to read ${expectedPath}`)
})

test('haus-setup instructs writing deep-context.json', () => {
  assert.ok(CMD.includes('deep-context.json'), 'command must mention deep-context.json')
})

test('haus-setup runs `haus recommend` after the docs skill and before the final apply', () => {
  const firstSkillRef = CMD.indexOf('writing-documentation')
  const recommendIdx = CMD.indexOf('haus recommend')
  const lastApplyIdx = CMD.lastIndexOf('haus apply --write')
  assert.ok(firstSkillRef !== -1, 'must reference the docs skill')
  assert.ok(recommendIdx !== -1, 'must run `haus recommend`')
  assert.ok(lastApplyIdx !== -1, 'must run `haus apply --write`')
  assert.ok(recommendIdx > firstSkillRef, '`haus recommend` must come after the docs skill')
  assert.ok(recommendIdx < lastApplyIdx, '`haus recommend` must come before the final apply')
})
