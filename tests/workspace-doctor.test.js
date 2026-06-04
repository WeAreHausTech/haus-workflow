import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'

// Point the recommender/apply at the vendored fixture catalog (no network, deterministic).
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

import { runWorkspaceSetup } from '../src/commands/workspace/setup.ts'
import {
  buildManifest,
  readManifest,
  writeWorkspaceManifest,
  manifestPath,
} from '../src/commands/workspace/manifest.ts'
import { runWorkspaceDoctor } from '../src/commands/workspace/doctor.ts'

function writeRepo(dir, pkg) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  writeFileSync(path.join(dir, 'yarn.lock'), '# lock')
}

function writeYaml(ws, body) {
  writeFileSync(path.join(ws, 'haus.workspace.yaml'), body)
}

/** Two healthy node repos under one workspace root. */
function makeWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-doctor-'))
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

// node:test forwards each test's stdout to the reporter over a V8-serialized
// worker pipe; large bursts can crash the worker on Linux. Mute console during
// the in-process setup/doctor runs and isolate process.exitCode.
function withExitCode(fn) {
  return async () => {
    const prev = process.exitCode
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
      process.exitCode = prev
    }
  }
}

test('buildManifest derives ok/failed/pending entries with version + timestamp', () => {
  const manifest = buildManifest({
    client: 'acme',
    version: '9.9.9',
    now: '2030-01-01T00:00:00.000Z',
    repos: [
      {
        name: 'fe',
        path: 'frontend',
        role: 'frontend',
        status: 'ok',
        lockItemCount: 3,
        catalogRef: 'main',
      },
      {
        name: 'be',
        path: 'api',
        role: 'backend',
        status: 'failed',
        lockItemCount: 0,
        catalogRef: null,
        error: 'boom',
      },
      {
        name: 'svc',
        path: 'svc',
        role: 'auto',
        status: 'pending',
        lockItemCount: 0,
        catalogRef: null,
      },
    ],
  })

  assert.equal(manifest.version, 1)
  assert.equal(manifest.client, 'acme')
  assert.equal(manifest.hausVersion, '9.9.9')

  const byName = Object.fromEntries(manifest.repos.map((r) => [r.name, r]))
  // ok → stamped with setup time + version
  assert.equal(byName.fe.status, 'ok')
  assert.equal(byName.fe.lastSetupAt, '2030-01-01T00:00:00.000Z')
  assert.equal(byName.fe.hausVersionAtSetup, '9.9.9')
  assert.equal(byName.fe.lockItemCount, 3)
  // failed → no setup stamp, carries error
  assert.equal(byName.be.status, 'failed')
  assert.equal(byName.be.lastSetupAt, null)
  assert.equal(byName.be.hausVersionAtSetup, null)
  assert.equal(byName.be.error, 'boom')
  // pending → no setup stamp
  assert.equal(byName.svc.status, 'pending')
  assert.equal(byName.svc.lastSetupAt, null)
})

test(
  'workspace setup --write writes the workspace manifest',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    assert.ok(existsSync(manifestPath(ws)), 'workspace.manifest.json written')
    const manifest = await readManifest(ws)
    assert.equal(manifest.version, 1)
    assert.equal(manifest.client, 'acme-corp')
    assert.equal(manifest.repos.length, 2)
    for (const repo of manifest.repos) {
      assert.equal(repo.status, 'ok')
      assert.ok(repo.lockItemCount > 0, `${repo.name} should record lock items`)
      assert.ok(repo.hausVersionAtSetup, `${repo.name} stamped with version`)
    }
  }),
)

test(
  'workspace doctor reports no drift on a clean setup',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    const result = await runWorkspaceDoctor(ws)
    assert.deepEqual(result.drift, [], 'clean setup has no drift')
    assert.equal(process.exitCode, 0, 'clean doctor keeps zero exit')
  }),
)

test(
  'workspace doctor flags a stale hausVersionAtSetup',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Rewrite the manifest with an old version on one repo.
    const manifest = await readManifest(ws)
    manifest.repos[0].hausVersionAtSetup = '0.0.1'
    await writeWorkspaceManifest(ws, manifest)

    const result = await runWorkspaceDoctor(ws)
    assert.ok(
      result.drift.some(
        (d) => d.repo === manifest.repos[0].name && d.kind === 'version-mismatch',
      ),
      'stale version flagged',
    )
    assert.equal(process.exitCode, 1, 'drift sets non-zero exit')
  }),
)

test(
  'workspace doctor flags a deleted .claude/ and missing lock',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    rmSync(path.join(ws, 'frontend', '.claude'), { recursive: true, force: true })
    rmSync(path.join(ws, 'api', '.haus-workflow', 'haus.lock.json'), { force: true })

    const result = await runWorkspaceDoctor(ws)
    assert.ok(
      result.drift.some((d) => d.repo === 'acme-frontend' && d.kind === 'missing-claude'),
      'deleted .claude/ flagged',
    )
    assert.ok(
      result.drift.some((d) => d.repo === 'acme-api' && d.kind === 'missing-lock'),
      'missing lock flagged',
    )
    assert.equal(process.exitCode, 1)
  }),
)

test(
  'workspace doctor flags a repo present in yaml but missing from the manifest',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Add a third repo to the yaml after the manifest was written.
    writeRepo(path.join(ws, 'svc'), { name: 'acme-svc', dependencies: {} })
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
        '  - name: acme-svc',
        '    path: svc',
        '    role: auto',
        'relationships: []',
        '',
      ].join('\n'),
    )

    const result = await runWorkspaceDoctor(ws)
    assert.ok(
      result.drift.some((d) => d.repo === 'acme-svc' && d.kind === 'missing-from-manifest'),
      'yaml repo absent from manifest flagged',
    )
    assert.equal(process.exitCode, 1)
  }),
)

test(
  'workspace doctor flags a missing manifest with a single workspace-level item',
  withExitCode(async () => {
    const ws = makeWorkspace()
    // Never ran setup → no manifest at all.
    const result = await runWorkspaceDoctor(ws)
    assert.equal(result.manifest, undefined)
    assert.ok(
      result.drift.some((d) => d.kind === 'no-manifest'),
      'missing manifest flagged',
    )
    // No per-repo noise: the only drift is the workspace-level no-manifest flag.
    assert.equal(result.drift.length, 1, 'no per-repo drift piled on top of no-manifest')
    assert.equal(process.exitCode, 1)
  }),
)

test(
  'workspace doctor flags an invalid (corrupt) lockfile',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Corrupt one repo's lock: a present item with an unparseable version → checkLock !ok, count > 0.
    writeFileSync(
      path.join(ws, 'api', '.haus-workflow', 'haus.lock.json'),
      JSON.stringify([{ id: 'x', type: 'rule', version: 'not-a-version' }], null, 2),
    )

    const result = await runWorkspaceDoctor(ws)
    assert.ok(
      result.drift.some((d) => d.repo === 'acme-api' && d.kind === 'invalid-lock'),
      'corrupt lock flagged as invalid-lock',
    )
    assert.equal(process.exitCode, 1)
  }),
)

test(
  'workspace setup --only carries forward prior entries verbatim (preserves stamps)',
  withExitCode(async () => {
    const ws = makeWorkspace()
    // First full run stamps both repos.
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })
    const before = await readManifest(ws)
    const apiBefore = before.repos.find((r) => r.name === 'acme-api')

    // Second run touches only the frontend; api must keep its original stamp.
    await runWorkspaceSetup(ws, { mode: 'fast', write: true, only: ['acme-frontend'] })
    const after = await readManifest(ws)
    const apiAfter = after.repos.find((r) => r.name === 'acme-api')

    assert.equal(apiAfter.status, 'ok', 'excluded repo keeps ok status')
    assert.equal(
      apiAfter.lastSetupAt,
      apiBefore.lastSetupAt,
      'excluded repo keeps its original lastSetupAt (not re-stamped)',
    )
    assert.equal(apiAfter.hausVersionAtSetup, apiBefore.hausVersionAtSetup)
    assert.equal(apiAfter.lockItemCount, apiBefore.lockItemCount)
  }),
)

test(
  'workspace doctor --json returns manifest + drift array shape',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    try {
      await runWorkspaceDoctor(ws, { json: true })
    } finally {
      console.log = orig
    }

    const payload = JSON.parse(lines.join('\n'))
    assert.ok(payload.manifest, 'json payload includes manifest')
    assert.ok(Array.isArray(payload.drift), 'json payload includes drift array')
  }),
)
