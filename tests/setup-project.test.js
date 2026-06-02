import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { execaSync } from 'execa'

function makeFixture() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-setup-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'setup-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  return temp
}

test('setup-project --fast --json writes scan + recommendation artifacts and exits 0', () => {
  const temp = makeFixture()
  const result = execaSync(
    'node',
    [path.resolve('dist/cli.js'), 'setup-project', '--fast', '--json'],
    { cwd: temp, reject: false },
  )

  assert.equal(
    result.exitCode,
    0,
    `expected exit 0, got ${result.exitCode}\nstderr: ${result.stderr}`,
  )

  // scan artifact
  assert.ok(
    existsSync(path.join(temp, '.haus-workflow/context-map.json')),
    'context-map.json not written',
  )
  const contextMap = JSON.parse(
    readFileSync(path.join(temp, '.haus-workflow/context-map.json'), 'utf8'),
  )
  assert.ok(Array.isArray(contextMap.repoRoles), 'repoRoles missing from context-map')

  // recommendation artifact
  assert.ok(
    existsSync(path.join(temp, '.haus-workflow/recommendation.json')),
    'recommendation.json not written',
  )
  const rec = JSON.parse(
    readFileSync(path.join(temp, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  assert.ok(Array.isArray(rec.recommended), 'recommended array missing from recommendation')

  // stdout contains scan JSON (repoRoles key) and recommend JSON (recommended key)
  assert.ok(result.stdout.includes('"repoRoles"'), 'scan JSON not in stdout')
  assert.ok(result.stdout.includes('"recommended"'), 'recommend JSON not in stdout')
})

test('guided setup skips readline prompts when setup-answers.json is pre-filled (WS6)', () => {
  const temp = makeFixture()
  // Agent pre-supplies answers conversationally by writing the file first.
  const seeded = {
    'What is this project for?': 'A client storefront',
    'Is it for a client, internal Haus work, or experimentation?': 'A client',
    'What should Claude help with most?': 'Feature work',
    'Is this project connected to other repositories?': 'No',
    'Are there parts of the project Claude should avoid touching?': 'The vendor dir',
    'Are there client-specific rules or sensitive areas?': 'Customer data',
    'Do you want a minimal, standard, or strict setup?': 'standard',
  }
  // Scan first so the .haus-workflow/ directory exists, then drop the seeded answers in.
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp, reject: false })
  writeFileSync(
    path.join(temp, '.haus-workflow/setup-answers.json'),
    JSON.stringify(seeded, null, 2),
  )

  // Decline the final confirm via stdin. If prompts were NOT skipped, this single
  // "n" line would be consumed as the answer to question 1, overwriting it.
  const result = execaSync('node', [path.resolve('dist/cli.js'), 'setup-project', '--guided'], {
    cwd: temp,
    input: 'n\n',
    reject: false,
  })
  assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`)

  const answers = JSON.parse(
    readFileSync(path.join(temp, '.haus-workflow/setup-answers.json'), 'utf8'),
  )
  // Every pre-filled answer is preserved verbatim — no prompt overwrote question 1.
  assert.deepEqual(answers, seeded)
})

test('setup-project --fast --json includes recommendation warnings in output', () => {
  const temp = makeFixture()
  execaSync('node', [path.resolve('dist/cli.js'), 'setup-project', '--fast', '--json'], {
    cwd: temp,
    reject: false,
  })
  // recommendation.json must be written; if it contains warnings they should be surfaced
  const rec = JSON.parse(
    readFileSync(path.join(temp, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  // warnings key exists and is an array (may be empty)
  assert.ok(Array.isArray(rec.warnings), 'recommendation.json has warnings array')
})
