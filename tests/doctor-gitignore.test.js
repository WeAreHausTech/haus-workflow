import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runDoctor } from '../src/commands/doctor.js'

// Materialization plan Task 2: `haus doctor` must flag a still-tracked machine-local
// scan artifact with the exact fix command. See ADR-0025.

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

/** Minimal fixtures so doctor reaches the gitignore-tracking check without noise
 * from earlier (unrelated) checks. */
function writeBaseFixtures(dir) {
  mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(dir, '.haus-workflow/context-map.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repoName: 'gitignore-doctor',
        packageManager: 'yarn',
        repoRoles: [],
        detectedStacks: {},
        dependencies: [],
        securityRisks: [],
        crossRepoHints: [],
        warnings: [],
        detectionStatus: 'unknown',
        unsupportedSignals: [],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(dir, '.haus-workflow/recommendation.json'),
    JSON.stringify({ recommended: [], warnings: [] }),
  )
  writeFileSync(path.join(dir, '.haus-workflow/WORKFLOW.md'), '# user workflow\n')
}

async function runInDir(dir, fn) {
  const prevCwd = process.cwd()
  const prevExit = process.exitCode
  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')
  const lines = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...args) => {
    lines.push(args.join(' '))
    origLog(...args)
  }
  console.warn = (...args) => {
    lines.push(args.join(' '))
    origWarn(...args)
  }
  try {
    process.chdir(dir)
    await fn()
    return lines.join('\n')
  } finally {
    process.exitCode = prevExit
    process.chdir(prevCwd)
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    console.log = origLog
    console.warn = origWarn
  }
}

test('doctor flags a still-tracked machine-local scan artifact with the fix command', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-tracked-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    git(dir, ['add', '.haus-workflow/context-map.json'])
    git(dir, ['commit', '-qm', 'poison: commit machine-local scan artifact'])

    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /GITIGNORE:.*context-map\.json/)
    assert.match(output, /git rm --cached/)
    assert.match(output, /context-map\.json/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor reports OK when nothing is tracked', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-clean-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)

    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /GITIGNORE: OK/)
    assert.doesNotMatch(output, /GITIGNORE:.*still tracked/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
