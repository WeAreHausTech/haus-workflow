import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runDoctor } from '../src/commands/doctor.js'

/** Minimal fixtures so doctor reaches the .prettierignore protection check. */
function writeBaseFixtures(dir) {
  mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(dir, '.haus-workflow/context-map.json'),
    JSON.stringify(
      {
        mode: 'fast',
        generatedAt: new Date().toISOString(),
        root: dir,
        repoName: 'prettierignore-doctor',
        packageManager: 'yarn',
        repoRoles: [],
        confidence: 0.5,
        detectedStacks: {
          frontend: [],
          backend: [],
          databases: [],
          testing: [],
          auth: [],
          tooling: [],
          packageManagers: [],
        },
        dependencies: [],
        securityRisks: [],
        crossRepoHints: [],
        warnings: [],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(dir, '.haus-workflow/recommendation.json'),
    JSON.stringify({ recommended: [], warnings: [] }),
  )
  // Presence alone gates the prettierignore check; skip HAUS-MANAGED to avoid
  // template-hash / tamper noise in this focused suite.
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

test('doctor flags when .claude/ is missing from .prettierignore', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-pi-missing-'))
  try {
    writeBaseFixtures(dir)
    writeFileSync(path.join(dir, '.prettierignore'), '.haus-workflow/\n')
    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /\.prettierignore: not protecting.*\.claude\//)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor accepts equivalent .claude protection patterns', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-pi-equiv-'))
  try {
    writeBaseFixtures(dir)
    writeFileSync(path.join(dir, '.prettierignore'), '.haus-workflow/\n/.claude/\n')
    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /\.prettierignore: protects .*\.claude\//)
    assert.doesNotMatch(output, /\.prettierignore: not protecting/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor accepts .claude/** as protection', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-pi-glob-'))
  try {
    writeBaseFixtures(dir)
    writeFileSync(path.join(dir, '.prettierignore'), '.haus-workflow/\n.claude/**\n')
    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /\.prettierignore: protects .*\.claude\//)
    assert.doesNotMatch(output, /\.prettierignore: not protecting/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
