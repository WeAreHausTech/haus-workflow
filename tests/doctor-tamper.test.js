import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runDoctor } from '../src/commands/doctor.js'

test('doctor flags a locally modified WORKFLOW.md body', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-tamper-'))
  const prevCwd = process.cwd()
  // doctor sets process.exitCode = 1 on blocking findings (tampered WORKFLOW.md,
  // missing settings.json, etc); isolate it so it doesn't leak to the runner.
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
    mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
    writeFileSync(
      path.join(dir, '.haus-workflow/context-map.json'),
      JSON.stringify(
        {
          mode: 'fast',
          generatedAt: new Date().toISOString(),
          root: dir,
          repoName: 'tamper-test',
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
    writeFileSync(
      path.join(dir, '.haus-workflow/WORKFLOW.md'),
      '<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 hash=sha256-deadbeef -->\nLOCALLY EDITED\n',
    )

    process.chdir(dir)
    await runDoctor()

    const output = lines.join('\n')
    assert.match(output, /modified locally|edited after haus wrote it/i)
    // A tampered managed file is a blocking finding → non-zero exit.
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
    process.chdir(prevCwd)
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    console.log = origLog
    console.warn = origWarn
    rmSync(dir, { recursive: true, force: true })
  }
})
