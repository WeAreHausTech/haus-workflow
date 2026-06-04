import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

// Point the recommender/apply at the vendored fixture catalog (no network, deterministic).
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

import {
  runWorkspaceSetup,
  resolveWorkspaceRoot,
} from '../src/commands/workspace/setup.ts'
import { writeWorkspaceArtifacts } from '../src/commands/workspace/aggregate.ts'

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
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-setup-'))
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
      'relationships:',
      '  - from: acme-frontend',
      '    to: acme-api',
      '',
    ].join('\n'),
  )
  return ws
}

function withExitCode(fn) {
  return async () => {
    const prev = process.exitCode
    process.exitCode = 0
    try {
      await fn()
    } finally {
      process.exitCode = prev
    }
  }
}

test(
  'runWorkspaceSetup --fast --write sets up each repo and writes the workspace layer',
  withExitCode(async () => {
    const ws = makeWorkspace()
    const result = await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    // Per-repo artifacts.
    for (const repo of ['frontend', 'api']) {
      const repoRoot = path.join(ws, repo)
      assert.ok(
        existsSync(path.join(repoRoot, '.haus-workflow/recommendation.json')),
        `${repo} recommendation.json missing`,
      )
      assert.ok(
        existsSync(path.join(repoRoot, '.haus-workflow/haus.lock.json')),
        `${repo} haus.lock.json missing`,
      )
      assert.ok(
        existsSync(path.join(repoRoot, '.claude/settings.json')),
        `${repo} .claude/settings.json missing`,
      )
    }

    // Workspace-root aggregate layer.
    assert.ok(existsSync(path.join(ws, '.haus-workflow/workspace-summary.json')))
    assert.ok(existsSync(path.join(ws, '.haus-workflow/dependency-ownership-map.json')))
    assert.ok(existsSync(path.join(ws, '.haus-workflow/cross-repo-summary.md')))
    assert.ok(existsSync(path.join(ws, '.haus-workflow/workspace-context-map.json')))
    // No collision (no repo at path '.') → workspace CLAUDE.md.
    assert.ok(existsSync(path.join(ws, 'CLAUDE.md')), 'workspace CLAUDE.md missing')

    const claudeMd = readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8')
    assert.ok(
      claudeMd.includes('@.haus-workflow/cross-repo-summary.md'),
      'workspace CLAUDE.md must import cross-repo summary',
    )
    assert.ok(claudeMd.includes('acme-frontend'), 'member repos listed in CLAUDE.md')

    const wcm = JSON.parse(
      readFileSync(path.join(ws, '.haus-workflow/workspace-context-map.json'), 'utf8'),
    )
    assert.ok(Array.isArray(wcm.roles), 'workspace-context-map has roles union')
    assert.deepEqual(wcm.relationships, [{ from: 'acme-frontend', to: 'acme-api' }])
    assert.equal(wcm.repos.length, 2)

    assert.equal(result.statuses.filter((s) => s.status === 'ok').length, 2)
  }),
)

test(
  'runWorkspaceSetup default preview does not write repo locks or workspace CLAUDE.md',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast' })

    assert.ok(
      !existsSync(path.join(ws, 'frontend/.haus-workflow/haus.lock.json')),
      'preview must not write repo lock',
    )
    assert.ok(
      !existsSync(path.join(ws, 'frontend/.claude/settings.json')),
      'preview must not write .claude/ files',
    )
    assert.ok(!existsSync(path.join(ws, 'CLAUDE.md')), 'preview must not write workspace CLAUDE.md')
    assert.ok(
      !existsSync(path.join(ws, '.haus-workflow/workspace-summary.json')),
      'preview must not write workspace artifacts',
    )
  }),
)

test(
  'runWorkspaceSetup --continue-on-error records failed repo while others succeed',
  withExitCode(async () => {
    const ws = makeWorkspace()
    // A repo path that points at a regular file makes the setup pipeline throw
    // (ensureDir under a file → ENOTDIR), exercising the resilient-mode branch.
    writeFileSync(path.join(ws, 'broken-file'), 'not a directory')
    writeYaml(
      ws,
      [
        'client: acme-corp',
        'repos:',
        '  - name: acme-frontend',
        '    path: frontend',
        '    role: frontend',
        '  - name: broken',
        '    path: broken-file',
        '    role: auto',
        'relationships: []',
        '',
      ].join('\n'),
    )

    const result = await runWorkspaceSetup(ws, {
      mode: 'fast',
      write: true,
      continueOnError: true,
    })

    const byName = Object.fromEntries(result.statuses.map((s) => [s.name, s]))
    assert.equal(byName['broken'].status, 'failed', 'malformed repo recorded as failed')
    assert.ok(byName['broken'].error, 'failed repo carries an error string')
    assert.equal(byName['acme-frontend'].status, 'ok', 'healthy repo still set up')
    assert.ok(existsSync(path.join(ws, 'frontend/.haus-workflow/haus.lock.json')))
  }),
)

test(
  'runWorkspaceSetup without --continue-on-error fails fast on a malformed repo',
  withExitCode(async () => {
    const ws = makeWorkspace()
    writeFileSync(path.join(ws, 'broken-file'), 'not a directory')
    writeYaml(
      ws,
      [
        'client: acme-corp',
        'repos:',
        '  - name: broken',
        '    path: broken-file',
        '    role: auto',
        '  - name: acme-frontend',
        '    path: frontend',
        '    role: frontend',
        'relationships: []',
        '',
      ].join('\n'),
    )

    await assert.rejects(
      () => runWorkspaceSetup(ws, { mode: 'fast', write: true }),
      'fail-fast default must throw on the first failed repo',
    )
  }),
)

test(
  'runWorkspaceSetup --only filters to the named repos',
  withExitCode(async () => {
    const ws = makeWorkspace()
    const result = await runWorkspaceSetup(ws, {
      mode: 'fast',
      write: true,
      only: ['acme-frontend'],
    })
    assert.equal(result.statuses.length, 1)
    assert.equal(result.statuses[0].name, 'acme-frontend')
    assert.ok(existsSync(path.join(ws, 'frontend/.haus-workflow/haus.lock.json')))
    assert.ok(
      !existsSync(path.join(ws, 'api/.haus-workflow/haus.lock.json')),
      'filtered-out repo not set up',
    )
  }),
)

test(
  'runWorkspaceSetup writes WORKSPACE.md (not CLAUDE.md collision) when a repo is the workspace root',
  withExitCode(async () => {
    const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-collide-'))
    writeRepo(ws, {
      name: 'root-repo',
      packageManager: 'yarn@4.5.3',
      dependencies: { react: '19.0.0' },
    })
    writeYaml(
      ws,
      [
        'client: solo',
        'repos:',
        '  - name: root-repo',
        '    path: .',
        '    role: frontend',
        'relationships: []',
        '',
      ].join('\n'),
    )

    await runWorkspaceSetup(ws, { mode: 'fast', write: true })

    assert.ok(
      existsSync(path.join(ws, '.haus-workflow/WORKSPACE.md')),
      'aggregate must land in WORKSPACE.md on root==repo collision',
    )
    const workspaceDoc = readFileSync(path.join(ws, '.haus-workflow/WORKSPACE.md'), 'utf8')
    assert.ok(workspaceDoc.includes('cross-repo-summary.md'))
    // The repo's own CLAUDE.md is still managed by the per-repo setup.
    assert.ok(existsSync(path.join(ws, 'CLAUDE.md')), 'repo CLAUDE.md still written')
  }),
)

test(
  'runWorkspaceSetup --only excluding the root repo still writes WORKSPACE.md (no CLAUDE.md clobber)',
  withExitCode(async () => {
    const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-only-collide-'))
    // Root repo at `.` plus a nested member; run --only on the nested one.
    writeRepo(ws, {
      name: 'root-repo',
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
        'client: solo',
        'repos:',
        '  - name: root-repo',
        '    path: .',
        '    role: frontend',
        '  - name: acme-api',
        '    path: api',
        '    role: backend',
        'relationships: []',
        '',
      ].join('\n'),
    )

    await runWorkspaceSetup(ws, { mode: 'fast', write: true, only: ['acme-api'] })

    // collision derives from the full config, so the aggregate must NOT inject
    // into the root repo's CLAUDE.md — it lands in WORKSPACE.md.
    assert.ok(
      existsSync(path.join(ws, '.haus-workflow/WORKSPACE.md')),
      'root repo in config forces WORKSPACE.md even when --only excludes it',
    )
    // The root repo was excluded by --only so it isn't set up here; either way the
    // workspace block must never appear in the root repo's CLAUDE.md.
    const claudeMdPath = path.join(ws, 'CLAUDE.md')
    if (existsSync(claudeMdPath)) {
      assert.ok(
        !readFileSync(claudeMdPath, 'utf8').includes('@.haus-workflow/cross-repo-summary.md'),
        'workspace block must not be injected into the root repo CLAUDE.md',
      )
    }
  }),
)

test(
  'runWorkspaceSetup flags a non-zero exit on malformed yaml instead of throwing',
  withExitCode(async () => {
    const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-bad-yaml-'))
    writeYaml(ws, 'client: x\nrepos: [ this: is, : broken\n  -\n')
    // Must not throw — surfaces a friendly error + exit code.
    await runWorkspaceSetup(ws, { mode: 'fast', write: true })
    assert.equal(process.exitCode, 1, 'malformed yaml sets non-zero exit')
  }),
)

test(
  'runWorkspaceSetup write+dryRun previews without writing aggregate artifacts',
  withExitCode(async () => {
    const ws = makeWorkspace()
    await runWorkspaceSetup(ws, { mode: 'fast', write: true, dryRun: true })
    assert.ok(
      !existsSync(path.join(ws, '.haus-workflow/workspace-summary.json')),
      'dryRun must not write workspace aggregate JSON',
    )
    assert.ok(
      !existsSync(path.join(ws, 'CLAUDE.md')),
      'dryRun must not write the workspace CLAUDE.md',
    )
  }),
)

test('resolveWorkspaceRoot walks up to the directory holding haus.workspace.yaml', () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-resolve-'))
  writeYaml(ws, 'client: x\nrepos: []\nrelationships: []\n')
  const nested = path.join(ws, 'a', 'b')
  mkdirSync(nested, { recursive: true })
  assert.equal(resolveWorkspaceRoot(nested), ws)
})

test(
  'writeWorkspaceArtifacts builds the aggregate from provided contexts without re-scanning',
  withExitCode(async () => {
    const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-agg-'))
    const written = await writeWorkspaceArtifacts(
      ws,
      [
        {
          name: 'fe',
          path: 'frontend',
          context: {
            repoName: 'fe',
            repoRoles: ['frontend'],
            packageManager: 'yarn',
            dependencies: ['react'],
            crossRepoHints: ['Monorepo orchestration detected'],
          },
        },
        {
          name: 'be',
          path: 'api',
          context: {
            repoName: 'be',
            repoRoles: ['backend'],
            packageManager: 'yarn',
            dependencies: ['react', '@nestjs/core'],
            crossRepoHints: [],
          },
        },
      ],
      [{ from: 'fe', to: 'be' }],
    )

    assert.ok(written.length >= 4, 'returns the written artifact paths')
    const ownership = JSON.parse(
      readFileSync(path.join(ws, '.haus-workflow/dependency-ownership-map.json'), 'utf8'),
    )
    assert.deepEqual(ownership['react'].sort(), ['be', 'fe'])
    const wcm = JSON.parse(
      readFileSync(path.join(ws, '.haus-workflow/workspace-context-map.json'), 'utf8'),
    )
    assert.deepEqual(wcm.roles.sort(), ['backend', 'frontend'])
    assert.deepEqual(wcm.crossRepoHints, ['Monorepo orchestration detected'])
  }),
)
