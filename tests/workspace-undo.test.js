import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'

// Point the recommender/apply at the vendored fixture catalog (no network, deterministic).
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

import { runWorkspaceSetup } from '../src/commands/workspace/setup.ts'
import { manifestPath } from '../src/commands/workspace/manifest.ts'
import { runWorkspaceUndo } from '../src/commands/workspace/undo.ts'
import { hausPath } from '../src/utils/paths.ts'

function writeRepo(dir, pkg) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  writeFileSync(path.join(dir, 'yarn.lock'), '# lock')
}

function writeYaml(ws, body) {
  writeFileSync(path.join(ws, 'haus.workspace.yaml'), body)
}

/** Two healthy node repos under one workspace root, matching workspace-doctor.test.js's fixture. */
function makeWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-undo-'))
  writeRepo(path.join(ws, 'frontend'), {
    name: 'acme-frontend',
    packageManager: 'yarn@4.5.3',
    dependencies: { react: '19.0.0' },
  })
  writeRepo(path.join(ws, 'api'), {
    name: 'acme-api',
    packageManager: 'yarn@4.5.3',
    dependencies: { '@nestjs/core': '10.0.0' },
  })
  writeYaml(
    ws,
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

/**
 * A workspace where the root itself is also a member repo (`path: .`) — triggers
 * `writeWorkspaceClaudeMd`'s collision path, which writes the standalone
 * `.haus-workflow/WORKSPACE.md` instead of injecting a block into the root CLAUDE.md.
 */
function makeCollisionWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-undo-collision-'))
  writeRepo(ws, {
    name: 'acme-root',
    packageManager: 'yarn@4.5.3',
    dependencies: { react: '19.0.0' },
  })
  writeRepo(path.join(ws, 'api'), {
    name: 'acme-api',
    packageManager: 'yarn@4.5.3',
    dependencies: { '@nestjs/core': '10.0.0' },
  })
  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-root',
      '    path: .',
      '    role: auto',
      '  - name: acme-api',
      '    path: api',
      '    role: backend',
      'relationships: []',
      '',
    ].join('\n'),
  )
  return ws
}

// node:test forwards each test's stdout to the reporter over a V8-serialized worker
// pipe; large bursts can crash the worker on Linux. Mute console during in-process runs.
function muted(fn) {
  return async () => {
    const prevExit = process.exitCode
    process.exitCode = 0
    const orig = { log: console.log, warn: console.warn, error: console.error }
    console.log = () => {}
    console.warn = () => {}
    console.error = () => {}
    try {
      await fn()
    } finally {
      console.log = orig.log
      console.warn = orig.warn
      console.error = orig.error
      process.exitCode = prevExit
    }
  }
}

test(
  'workspace undo removes per-repo haus setup, workspace artifacts, and the workspace CLAUDE.md block, leaving haus.workspace.yaml intact',
  muted(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Sanity: setup actually produced everything undo is expected to remove.
    assert.ok(existsSync(path.join(ws, 'frontend', '.claude')), 'frontend .claude/ exists')
    assert.ok(existsSync(path.join(ws, 'api', '.claude')), 'api .claude/ exists')
    assert.ok(existsSync(manifestPath(ws)), 'workspace manifest exists')
    assert.ok(existsSync(hausPath(ws, 'workspace-summary.json')), 'aggregate artifact exists')
    const claudeMdBefore = readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8')
    assert.match(claudeMdBefore, /HAUS:BEGIN/, 'workspace CLAUDE.md has the haus import block')

    await runWorkspaceUndo(ws, { yes: true })

    assert.equal(existsSync(path.join(ws, 'frontend', '.claude', 'rules', 'haus.md')), false)
    assert.equal(existsSync(path.join(ws, 'api', '.claude', 'rules', 'haus.md')), false)
    assert.equal(existsSync(manifestPath(ws)), false, 'workspace manifest removed')
    assert.equal(existsSync(hausPath(ws, 'workspace-summary.json')), false)
    assert.equal(existsSync(hausPath(ws, 'dependency-ownership-map.json')), false)
    assert.equal(existsSync(hausPath(ws, 'cross-repo-summary.md')), false)
    assert.equal(existsSync(hausPath(ws, 'workspace-context-map.json')), false)

    // haus.workspace.yaml is the user's own config — never touched.
    assert.ok(existsSync(path.join(ws, 'haus.workspace.yaml')), 'haus.workspace.yaml preserved')

    // Workspace CLAUDE.md: the haus block is stripped, not the whole file (no other
    // user content was present here, so the file itself is removed once the block
    // holding all of its content is gone — matches per-repo undo's own contract for
    // a CLAUDE.md that contained nothing else).
    assert.equal(existsSync(path.join(ws, 'CLAUDE.md')), false)
  }),
)

test(
  'workspace undo removes the standalone WORKSPACE.md when the collision path was used',
  muted(async () => {
    const ws = makeCollisionWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    const workspaceMdPath = hausPath(ws, 'WORKSPACE.md')
    assert.ok(existsSync(workspaceMdPath), 'setup used the collision path (WORKSPACE.md written)')
    assert.ok(existsSync(manifestPath(ws)), 'workspace manifest exists')

    await runWorkspaceUndo(ws, { yes: true })

    assert.equal(existsSync(workspaceMdPath), false, 'WORKSPACE.md removed')
    assert.equal(existsSync(manifestPath(ws)), false, 'workspace manifest removed')
    assert.ok(existsSync(path.join(ws, 'haus.workspace.yaml')), 'haus.workspace.yaml preserved')
  }),
)

test(
  'workspace undo preserves a locally-modified lock-tracked file in one repo',
  muted(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    const lockPath = path.join(ws, 'frontend', '.haus-workflow', 'haus.lock.json')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    assert.ok(lock.length > 0, 'frontend has at least one lock-tracked item')
    const trackedRelPath = lock[0].paths?.[0]
    assert.ok(trackedRelPath, 'lock item has a tracked path')
    const trackedAbsPath = path.join(ws, 'frontend', trackedRelPath)
    writeFileSync(trackedAbsPath, 'USER EDITED AFTER SETUP')

    await runWorkspaceUndo(ws, { yes: true })

    assert.ok(existsSync(trackedAbsPath), 'locally-modified tracked file must survive workspace undo')
    assert.equal(readFileSync(trackedAbsPath, 'utf8'), 'USER EDITED AFTER SETUP')
  }),
)

test(
  'workspace undo fails cleanly when haus.workspace.yaml is missing',
  muted(async () => {
    const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-undo-noconfig-'))
    await runWorkspaceUndo(ws, { yes: true })
    assert.equal(process.exitCode, 1)
  }),
)

test(
  'workspace undo sets a non-zero exit code when one repo fails, but still processes the rest',
  muted(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Force runUndo to throw for 'api' only: readJson rethrows non-ENOENT fs errors
    // (e.g. EISDIR), so replacing its haus.lock.json with a directory of the same
    // name is a deterministic way to trigger a real failure without mocking.
    const apiLockPath = path.join(ws, 'api', '.haus-workflow', 'haus.lock.json')
    rmSync(apiLockPath, { force: true })
    mkdirSync(apiLockPath)

    await runWorkspaceUndo(ws, { yes: true })

    assert.equal(process.exitCode, 1, 'a per-repo undo failure must fail the exit code')
    // The other repo's undo still ran to completion despite api's failure.
    assert.equal(existsSync(path.join(ws, 'frontend', '.claude', 'rules', 'haus.md')), false)
  }),
)
