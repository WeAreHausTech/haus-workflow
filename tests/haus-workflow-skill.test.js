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

test('project:refresh is a full non-destructive sync (haus update + re-run init), not a bare apply', () => {
  const aliasRow = SKILL.split('\n').find((l) => l.includes('`project:refresh`'))
  assert.ok(aliasRow, 'aliases table must include a project:refresh row')
  assert.ok(
    !/\|\s*`haus apply --write`\s*\|/.test(aliasRow),
    'project:refresh must no longer map directly to a bare `haus apply --write`',
  )

  assert.ok(
    SKILL.includes('### Refresh (`project:refresh`)'),
    'must have a Refresh procedure section',
  )
  const section = SKILL.slice(
    SKILL.indexOf('### Refresh (`project:refresh`)'),
    SKILL.indexOf('### Clone (`project:clone`)'),
  )
  assert.ok(section.includes('haus update'), 'refresh must run haus update first')
  assert.ok(!section.includes('haus undo'), 'refresh must NOT remove anything first (see reinit)')
  assert.ok(
    section.includes('Setup (`project:init`)'),
    'refresh must hand off to the project:init procedure to redo scan/docs/recommend/apply',
  )
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

// Regression: an earlier draft's "and N more" count on a non-final page's "More
// options" line was arithmetically wrong (named 3 preview items but undercounted
// how many were left beyond them). Every alias-table task must be reachable
// exactly once across all pages, and each page's declared "and N more" (if any)
// must match how many tasks are genuinely left after that page's named preview.
test('Step 1 menu pages cover all 12 alias-table tasks exactly once, "and N more" counts are correct', () => {
  const TOTAL_TASKS = 12
  const menuBlock = SKILL.slice(
    SKILL.indexOf('```\nQuestion 1:'),
    SKILL.indexOf("Map the user's selection"),
  )
  const questionBlocks = menuBlock.split(/Question \d:/).slice(1)

  const realOptionCounts = questionBlocks.map(
    (block) =>
      (block.match(/^\s*\d+\.\s*\[(?:project|global|—)\]\s+(?!More options)/gm) ?? []).length,
  )
  const totalRealShown = realOptionCounts.reduce((a, b) => a + b, 0)
  assert.equal(totalRealShown, TOTAL_TASKS, "every page's real options must sum to all 12 tasks")

  let cumulativeShown = 0
  questionBlocks.forEach((block, i) => {
    cumulativeShown += realOptionCounts[i]
    const moreLineMatch = block.match(/More options — see: ([^\n]+)/)
    if (!moreLineMatch) return // last page has no continuation line
    const items = moreLineMatch[1].split(',').map((s) => s.trim())
    const andMoreMatch = items[items.length - 1].match(/^and (\d+) more$/)
    const namedCount = andMoreMatch ? items.length - 1 : items.length
    const declaredMore = andMoreMatch ? Number(andMoreMatch[1]) : 0
    const actualRemaining = TOTAL_TASKS - cumulativeShown - namedCount
    assert.equal(
      declaredMore,
      actualRemaining,
      `page ${i + 1}'s "and N more" must equal tasks left after its named preview (named ${namedCount}, expected "and ${actualRemaining} more", got ${declaredMore})`,
    )
  })
})
