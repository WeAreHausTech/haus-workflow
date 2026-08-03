import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runDoctor } from '../src/commands/doctor.js'

function writeBaseFixtures(dir, { recommended, lock }) {
  mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(dir, '.haus-workflow/context-map.json'),
    JSON.stringify(
      {
        mode: 'fast',
        generatedAt: new Date().toISOString(),
        root: dir,
        repoName: 'orphan-test',
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
    JSON.stringify({ recommended, warnings: [] }),
  )
  writeFileSync(path.join(dir, '.haus-workflow/haus.lock.json'), JSON.stringify(lock))
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

test('doctor advises when an installed item is no longer in the current recommendation', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-orphan-'))
  try {
    writeBaseFixtures(dir, {
      recommended: [{ id: 'skill.still-needed' }],
      lock: [
        { id: 'skill.still-needed', type: 'skill' },
        { id: 'skill.orphaned', type: 'skill' },
      ],
    })
    const output = await runInDir(dir, () => runDoctor())
    assert.match(output, /skill\.orphaned/)
    assert.match(output, /no longer.*recommendation|no longer recommended/i)
    assert.doesNotMatch(output.split('\n').find((l) => l.includes('CATALOG ITEMS')) ?? '', /skill\.still-needed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor does not flag an item still present in the current recommendation', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-orphan-ok-'))
  try {
    writeBaseFixtures(dir, {
      recommended: [{ id: 'skill.still-needed' }],
      lock: [{ id: 'skill.still-needed', type: 'skill' }],
    })
    const output = await runInDir(dir, () => runDoctor())
    assert.doesNotMatch(output, /CATALOG ITEMS:/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
