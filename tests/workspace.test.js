import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'

// Point the recommender/apply at the vendored fixture catalog (no network, deterministic).
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

import { runWorkspace } from '../src/commands/workspace.ts'

function writeRepo(dir, pkg) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  writeFileSync(path.join(dir, 'yarn.lock'), '# lock')
}

function makeWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-dispatch-'))
  writeRepo(path.join(ws, 'frontend'), {
    name: 'acme-frontend',
    dependencies: { react: '19.0.0' },
  })
  writeRepo(path.join(ws, 'api'), {
    name: 'acme-api',
    dependencies: { '@nestjs/core': '10.0.0' },
  })
  writeFileSync(
    path.join(ws, 'haus.workspace.yaml'),
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-frontend',
      '    path: frontend',
      '    role: frontend',
      '  - name: acme-api',
      '    path: api',
      '    role: backend',
      'relationships: []',
      '',
    ].join('\n'),
  )
  return ws
}

// Mute console + isolate process.exitcode AND cwd (the dispatcher resolves the
// workspace root from process.cwd()). Restore everything in finally.
function inWorkspace(ws, fn) {
  return async () => {
    const prevCwd = process.cwd()
    const prevExit = process.exitCode
    process.exitCode = 0
    const orig = { log: console.log, warn: console.warn, error: console.error }
    console.log = () => {}
    console.warn = () => {}
    console.error = () => {}
    process.chdir(ws)
    try {
      await fn()
    } finally {
      process.chdir(prevCwd)
      console.log = orig.log
      console.warn = orig.warn
      console.error = orig.error
      process.exitCode = prevExit
    }
  }
}

test('runWorkspace init scaffolds haus.workspace.yaml in the cwd', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-init-'))
  const prevCwd = process.cwd()
  const orig = console.log
  console.log = () => {}
  process.chdir(dir)
  try {
    await runWorkspace('init')
  } finally {
    process.chdir(prevCwd)
    console.log = orig
  }
  assert.ok(existsSync(path.join(dir, 'haus.workspace.yaml')))
})

test('runWorkspace scan writes the aggregate artifacts', async () => {
  const ws = makeWorkspace()
  await inWorkspace(ws, async () => {
    await runWorkspace('scan')
  })()
  assert.ok(existsSync(path.join(ws, '.haus-workflow/workspace-summary.json')))
  assert.ok(existsSync(path.join(ws, '.haus-workflow/cross-repo-summary.md')))
  assert.ok(existsSync(path.join(ws, '.haus-workflow/workspace-context-map.json')))
})

test('runWorkspace setup --only normalizes a comma list to one repo', async () => {
  const ws = makeWorkspace()
  await inWorkspace(ws, async () => {
    await runWorkspace('setup', { fast: true, write: true, only: 'acme-frontend' })
  })()
  assert.ok(existsSync(path.join(ws, 'frontend/.haus-workflow/haus.lock.json')))
  assert.ok(
    !existsSync(path.join(ws, 'api/.haus-workflow/haus.lock.json')),
    'filtered-out repo not set up',
  )
})

test('runWorkspace setup then doctor reports healthy; mutation flags drift', async () => {
  const ws = makeWorkspace()
  await inWorkspace(ws, async () => {
    await runWorkspace('setup', { fast: true, write: true })
    await runWorkspace('doctor')
    assert.equal(process.exitCode, 0, 'clean workspace doctor is zero-exit')

    rmSync(path.join(ws, 'frontend/.claude'), { recursive: true, force: true })
    await runWorkspace('doctor')
    assert.equal(process.exitCode, 1, 'drift sets non-zero exit')
  })()
})

test('runWorkspace scan without yaml sets a non-zero exit instead of throwing', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-noyaml-'))
  await inWorkspace(dir, async () => {
    await runWorkspace('scan')
    assert.equal(process.exitCode, 1)
  })()
})
