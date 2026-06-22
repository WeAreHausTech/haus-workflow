// tests/haus-workflow-skill-add-skills.test.js
// P5-4: the haus-workflow skill exposes a `project:add-skills` opt-in flow —
// in the alias table, the no-arg menu, and a post-run procedure that scans,
// recommends, offers grouped opt-ins, and applies them.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SKILL = fs.readFileSync('library/global/skills/haus-workflow/SKILL.md', 'utf8')

test('add-skills task is in the alias table', () => {
  assert.ok(SKILL.includes('project:add-skills'), 'alias table must list project:add-skills')
  assert.ok(/add-skills.*opt-in/.test(SKILL), 'should document add-skills / opt-in aliases')
})

test('add-skills appears in the no-arg menu as option 6', () => {
  const menu = SKILL.slice(SKILL.indexOf('Question: "What would you like to do?"'))
  assert.ok(/6\.\s*\[project\]\s*project:add-skills/.test(menu), 'menu must offer option 6')
})

test('add-skills procedure scans, recommends, offers opt-ins, and applies', () => {
  const proc = SKILL.slice(SKILL.indexOf('### Add optional skills'))
  assert.ok(proc.length > 0, 'must have an Add optional skills procedure section')
  assert.ok(proc.includes('haus scan'), 'must refresh via haus scan')
  assert.ok(proc.includes('haus recommend'), 'must run haus recommend')
  assert.ok(proc.includes('optInEligible'), 'must read optInEligible')
  assert.ok(proc.includes('haus.lock.json'), 'must filter against already-installed lock')
  assert.ok(proc.includes('AskUserQuestion'), 'must present choices via AskUserQuestion')
  assert.ok(
    proc.includes('haus recommend --include'),
    'must add chosen skills via recommend --include',
  )
  assert.ok(proc.includes('haus apply --write'), 'must apply the chosen items')
})

test('add-skills handles the nothing-eligible case gracefully', () => {
  const proc = SKILL.slice(SKILL.indexOf('### Add optional skills'))
  assert.ok(
    /already installed|No optional helpers|nothing is eligible/i.test(proc),
    'must handle the empty case with a plain message',
  )
})

test('add-skills includes config scaffold preserve-by-default', () => {
  const proc = SKILL.slice(SKILL.indexOf('### Add optional skills'))
  assert.ok(proc.includes('haus scaffold'), 'must offer config scaffold')
  assert.ok(proc.includes('--force'), 'must mention --force only for explicit replace')
})
