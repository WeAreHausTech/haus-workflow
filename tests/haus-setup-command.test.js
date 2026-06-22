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

test('haus-setup offers opt-in helpers (optInEligible) between recommend and final apply', () => {
  assert.ok(CMD.includes('optInEligible'), 'must read optInEligible from recommendation.json')
  assert.ok(CMD.includes('AskUserQuestion'), 'must use AskUserQuestion to offer opt-ins')
  assert.ok(CMD.includes('haus recommend --include'), 'must add opt-ins via recommend --include')
  // The opt-in step must sit after the first recommend and before the final apply.
  const recommendIdx = CMD.indexOf('haus recommend')
  const optInIdx = CMD.indexOf('optInEligible')
  const lastApplyIdx = CMD.lastIndexOf('haus apply --write')
  assert.ok(optInIdx > recommendIdx, 'opt-in offer must come after the first recommend')
  assert.ok(optInIdx < lastApplyIdx, 'opt-in offer must come before the final apply')
})

test('haus-setup surfaces config scaffold preserve-by-default (force only on explicit replace)', () => {
  assert.ok(CMD.includes('haus scaffold'), 'must offer config scaffold')
  assert.ok(CMD.includes('--force'), 'must mention --force as the explicit overwrite path')
  assert.ok(
    /preserve|preserves|by default/i.test(CMD),
    'must state scaffold preserves existing files by default',
  )
})
