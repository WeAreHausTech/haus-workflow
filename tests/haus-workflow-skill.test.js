// tests/haus-workflow-skill.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SKILL = fs.readFileSync('library/global/skills/haus-workflow/SKILL.md', 'utf8')

test('haus-workflow SKILL.md keeps the required setup-flow references', () => {
  // Guards the high-stakes global skill: it must route to the init reference, write
  // project docs, and complete workflow-config.md.
  for (const phrase of ['references/init.md', 'project docs', 'workflow-config.md']) {
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

test('SKILL.md no longer points at the removed standalone command files', () => {
  for (const legacy of [
    'haus-setup.md',
    'haus-clone.md',
    'haus-cloneandsetup.md',
    'haus-doctor.md',
    'haus-fix.md',
  ]) {
    assert.ok(!SKILL.includes(legacy), `SKILL.md must not reference removed file: ${legacy}`)
  }
})

test('project:reinit task is defined with a confirm-then-undo-then-init procedure', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`project:reinit`'))
  assert.ok(aliasRow, 'aliases table must include a project:reinit row')

  const section = SKILL.slice(SKILL.indexOf('### Reinit (`project:reinit`)'))
  assert.ok(section.includes('AskUserQuestion'), 'reinit must confirm before removing files')
  assert.ok(section.includes('haus undo --yes'), 'reinit must run haus undo --yes')
  assert.ok(
    section.indexOf('Setup (`project:init`)') > 0 ||
      section.toLowerCase().includes('setup (`project:init`) above'),
    'reinit must hand off to the project:init procedure',
  )
})

test('project:fix task is defined with a diagnose-then-fix procedure', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`project:fix`'))
  assert.ok(aliasRow, 'aliases table must include a project:fix row')
  assert.ok(SKILL.includes('### Fix (`project:fix`)'), 'must have a Fix procedure section')
  assert.ok(SKILL.includes('haus doctor'), 'fix procedure must run haus doctor')
})

test('help task skips running a command entirely', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`help`'))
  assert.ok(aliasRow, 'aliases table must include a help row')
  assert.ok(SKILL.includes('Exception — `help`'), 'must document help as a Step-2 exception')
  assert.ok(/no command runs at all/i.test(SKILL), 'help must explicitly run no command')
})

test('Step 1 menu is split into questions of at most 4 options each (AskUserQuestion cap)', () => {
  const menuBlock = SKILL.slice(
    SKILL.indexOf('```\nQuestion 1:'),
    SKILL.indexOf("Map the user's selection"),
  )
  const questionBlocks = menuBlock.split(/Question \d:/).slice(1)
  assert.ok(questionBlocks.length >= 2, 'menu must be split into multiple questions')
  for (const block of questionBlocks) {
    const optionCount = (block.match(/^\s*\d+\.\s*\[/gm) ?? []).length
    assert.ok(optionCount <= 4, `each question must have at most 4 options, got ${optionCount}`)
  }
})
