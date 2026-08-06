import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'

import { runLinkContext } from '../src/workspace/link-context/link.ts'
import { buildLinkPlan, repoFolderPrefix } from '../src/workspace/link-context/plan.ts'
import {
  readManifest,
  writeWorkspaceManifest,
  buildManifest,
} from '../src/commands/workspace/manifest.ts'
import { runWorkspaceDoctor } from '../src/commands/workspace/doctor.ts'

// `runWorkspaceDoctor` sets `process.exitCode = 1` when it finds drift — several
// tests below deliberately trigger drift. Isolate that per test (matches
// workspace-doctor.test.js's own `withExitCode` helper) so it doesn't leak into the
// overall test-file exit status.
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

function writeYaml(ws, body) {
  writeFileSync(path.join(ws, 'haus.workspace.yaml'), body)
}

function writeSkill(repoRoot, name, body = '# skill\n') {
  const dir = path.join(repoRoot, '.claude', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), body)
  return path.join(dir, 'SKILL.md')
}

function writeAgent(repoRoot, name, body = '# agent\n') {
  const dir = path.join(repoRoot, '.claude', 'agents')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${name}.md`), body)
}

function writeCommand(repoRoot, name, body = '# command\n') {
  const dir = path.join(repoRoot, '.claude', 'commands')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${name}.md`), body)
}

/** Two haus-initialized member repos, each with a distinct skill/agent. */
function makeWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-link-'))
  const repoA = path.join(ws, 'frontend')
  const repoB = path.join(ws, 'api')
  mkdirSync(repoA, { recursive: true })
  mkdirSync(repoB, { recursive: true })
  writeSkill(repoA, 'react19-patterns', '# React 19 patterns\n')
  writeAgent(repoA, 'frontend-reviewer', '# Frontend reviewer\n')
  writeSkill(repoB, 'nestjs-patterns', '# Nest patterns\n')
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
  return { ws, repoA, repoB }
}

/** Writes a minimal "clean setup" manifest (no dependency on the recommender
 * pipeline) so `runWorkspaceDoctor` reports zero pre-existing per-repo drift,
 * isolating any drift the assertions check for to `linkedContext` alone. */
async function writeCleanManifest(ws, repoNames) {
  for (const name of repoNames) {
    const repoRoot = path.join(ws, name === 'acme-frontend' ? 'frontend' : 'api')
    mkdirSync(path.join(repoRoot, '.haus-workflow'), { recursive: true })
    writeFileSync(path.join(repoRoot, '.haus-workflow', 'haus.lock.json'), '[]')
  }
  const manifest = buildManifest({
    client: 'acme-corp',
    repos: repoNames.map((name) => ({
      name,
      path: name === 'acme-frontend' ? 'frontend' : 'api',
      role: 'auto',
      status: 'ok',
      lockItemCount: 0,
      catalogRef: null,
    })),
  })
  await writeWorkspaceManifest(ws, manifest)
}

test('repoFolderPrefix uses the last folder segment, falling back for a root member', () => {
  assert.equal(repoFolderPrefix({ id: 'x', folder: 'apps/frontend', absPath: '/x/apps/frontend' }), 'frontend')
  assert.equal(repoFolderPrefix({ id: 'root-repo', folder: '.', absPath: '/tmp/my-workspace' }), 'my-workspace')
})

test(
  'runLinkContext --write copies skills/agents into .claude/ with repo-prefixed names, no collisions',
  async () => {
    const { ws } = makeWorkspace()
    const result = await runLinkContext(ws, { write: true })

    assert.equal(result.ok, true)
    assert.equal(result.dryRun, false)
    assert.equal(result.skipped.length, 0)

    assert.ok(existsSync(path.join(ws, '.claude/skills/frontend--react19-patterns/SKILL.md')))
    assert.ok(existsSync(path.join(ws, '.claude/agents/frontend--frontend-reviewer.md')))
    assert.ok(existsSync(path.join(ws, '.claude/skills/api--nestjs-patterns/SKILL.md')))

    assert.equal(result.linked.length, 3)
    assert.equal(result.added.length, 3)

    const manifest = await readManifest(ws)
    assert.ok(manifest.linkedContext, 'manifest carries a linkedContext section')
    assert.equal(manifest.linkedContext.length, 3)
    const skillEntry = manifest.linkedContext.find((e) => e.name === 'react19-patterns')
    assert.equal(skillEntry.repo, 'acme-frontend')
    assert.equal(skillEntry.type, 'skill')
    assert.equal(skillEntry.path, '.claude/skills/frontend--react19-patterns')
    assert.equal(skillEntry.sourceRelPath, '.claude/skills/react19-patterns')
    assert.ok(skillEntry.sourceHash.startsWith('sha256-') || skillEntry.sourceHash.length > 0)

    // Gitignore updated for the workspace root.
    const gi = readFileSync(path.join(ws, '.gitignore'), 'utf8')
    assert.ok(gi.includes('.claude/skills/*--*/'))
    assert.ok(gi.includes('.claude/agents/*--*.md'))
  },
)

test('runLinkContext default preview does not write copies or the manifest', async () => {
  const { ws } = makeWorkspace()
  const result = await runLinkContext(ws)

  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.equal(result.added.length, 3)
  assert.ok(!existsSync(path.join(ws, '.claude/skills/frontend--react19-patterns')))
  assert.equal(await readManifest(ws), undefined)
})

test('runLinkContext skips a member that is not cloned locally, no error', async () => {
  const { ws } = makeWorkspace()
  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-frontend',
      '    path: frontend',
      '    role: frontend',
      '  - name: acme-missing',
      '    path: not-cloned-yet',
      '    role: auto',
      'relationships: []',
      '',
    ].join('\n'),
  )

  const result = await runLinkContext(ws, { write: true })
  assert.equal(result.ok, true)
  assert.ok(
    result.skipped.some((s) => s.repo === 'acme-missing' && /not cloned/.test(s.reason)),
    'uncloned member skipped with a clear reason',
  )
  // The other, valid member still links fine.
  assert.ok(existsSync(path.join(ws, '.claude/skills/frontend--react19-patterns')))
})

test('runLinkContext skips a member with no .claude/skills|agents|commands', async () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-link-noclaude-'))
  const repoRoot = path.join(ws, 'plain')
  mkdirSync(repoRoot, { recursive: true })
  writeFileSync(path.join(repoRoot, 'package.json'), '{}')
  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-plain',
      '    path: plain',
      '    role: auto',
      'relationships: []',
      '',
    ].join('\n'),
  )

  const result = await runLinkContext(ws, { write: true })
  assert.equal(result.ok, true)
  assert.equal(result.linked.length, 0)
  assert.ok(
    result.skipped.some((s) => s.repo === 'acme-plain' && /nothing to link/.test(s.reason)),
  )
})

test('runLinkContext fails loudly on a name collision and writes nothing', async () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-link-collide-'))
  const repoA = path.join(ws, 'group1', 'shared')
  const repoB = path.join(ws, 'group2', 'shared')
  writeSkill(repoA, 'dup-skill', 'source a\n')
  writeSkill(repoB, 'dup-skill', 'source b\n')
  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: repo-a',
      '    path: group1/shared',
      '    role: auto',
      '  - name: repo-b',
      '    path: group2/shared',
      '    role: auto',
      'relationships: []',
      '',
    ].join('\n'),
  )

  const result = await runLinkContext(ws, { write: true })
  assert.equal(result.ok, false)
  assert.equal(result.collisions.length, 1)
  assert.equal(result.collisions[0].type, 'skill')
  assert.equal(result.collisions[0].destKey, 'shared--dup-skill')
  assert.deepEqual(result.collisions[0].repos.sort(), ['repo-a', 'repo-b'])

  // Never silently overwrite: nothing written for either side.
  assert.ok(!existsSync(path.join(ws, '.claude', 'skills', 'shared--dup-skill')))
  assert.equal(await readManifest(ws), undefined)
})

test('buildLinkPlan resolves a name collision deterministically regardless of member order', async () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-link-collide-order-'))
  const repoA = path.join(ws, 'group1', 'shared')
  const repoB = path.join(ws, 'group2', 'shared')
  writeSkill(repoA, 'dup-skill')
  writeSkill(repoB, 'dup-skill')

  const members = [
    { id: 'repo-a', folder: 'group1/shared', absPath: repoA, source: 'haus.workspace.yaml' },
    { id: 'repo-b', folder: 'group2/shared', absPath: repoB, source: 'haus.workspace.yaml' },
  ]
  const plan = await buildLinkPlan(members)
  assert.equal(plan.collisions.length, 1)
  assert.equal(plan.entries.length, 0, 'no entry emitted for a colliding key')
})

test(
  'workspace doctor flags a stale linked-context entry when the source changes, without misreporting drift',
  withExitCode(async () => {
    const { ws } = makeWorkspace()
    await writeCleanManifest(ws, ['acme-frontend', 'acme-api'])
    const linkResult = await runLinkContext(ws, { write: true })
    assert.equal(linkResult.ok, true)

    const clean = await runWorkspaceDoctor(ws)
    assert.deepEqual(clean.drift, [], 'no drift right after linking against an unchanged source')

    // Edit the SOURCE (member repo's own skill), not the copy.
    writeFileSync(
      path.join(ws, 'frontend', '.claude', 'skills', 'react19-patterns', 'SKILL.md'),
      '# React 19 patterns (updated)\n',
    )

    const after = await runWorkspaceDoctor(ws)
    assert.equal(after.drift.length, 1, 'exactly one drift item — the stale linked entry')
    assert.equal(after.drift[0].repo, 'acme-frontend')
    assert.equal(after.drift[0].kind, 'stale-linked-context')
    assert.match(after.drift[0].detail, /re-run `haus workspace link-context`/i)
  }),
)

test(
  'workspace doctor flags a missing-linked-context-copy entry when the destination copy is deleted',
  withExitCode(async () => {
    const { ws } = makeWorkspace()
    await writeCleanManifest(ws, ['acme-frontend', 'acme-api'])
    const linkResult = await runLinkContext(ws, { write: true })
    assert.equal(linkResult.ok, true)

    const clean = await runWorkspaceDoctor(ws)
    assert.deepEqual(clean.drift, [], 'no drift right after linking')

    // Delete the DESTINATION copy (not the source) — simulates a user manually
    // removing .claude/skills/<repo>--<skill>/ (or a cleanup tool touching it).
    const copyPath = path.join(ws, '.claude', 'skills', 'frontend--react19-patterns')
    rmSync(copyPath, { recursive: true, force: true })

    const after = await runWorkspaceDoctor(ws)
    assert.equal(after.drift.length, 1, 'exactly one drift item — the missing copy')
    assert.equal(after.drift[0].repo, 'acme-frontend')
    assert.equal(after.drift[0].kind, 'missing-linked-context-copy')
    assert.match(after.drift[0].detail, /re-run `haus workspace link-context`/i)
  }),
)

test(
  'workspace doctor flags a missing-linked-context-source entry when the member repo is gone',
  withExitCode(async () => {
    const { ws } = makeWorkspace()
    await writeCleanManifest(ws, ['acme-frontend', 'acme-api'])
    await runLinkContext(ws, { write: true })

    // Remove the member entirely from the workspace config (simulates it dropping
    // out of haus.workspace.yaml before link-context was re-run to reconcile).
    writeYaml(
      ws,
      [
        'client: acme-corp',
        'repos:',
        '  - name: acme-api',
        '    path: api',
        '    role: backend',
        'relationships: []',
        '',
      ].join('\n'),
    )
    // Doctor's per-repo loop iterates config.repos, so acme-frontend no longer
    // appears there — but its linkedContext entries remain in the manifest until
    // link-context reconciles, which is exactly what this flags.
    const manifest = await readManifest(ws)
    manifest.repos = manifest.repos.filter((r) => r.name === 'acme-api')
    await writeWorkspaceManifest(ws, manifest)

    const result = await runWorkspaceDoctor(ws)
    assert.ok(
      result.drift.some(
        (d) => d.repo === 'acme-frontend' && d.kind === 'missing-linked-context-source',
      ),
      'dropped member flagged for cleanup',
    )
  }),
)

test('collectSourceAssets ignores a symlinked skill directory and a symlinked flat .md file', async () => {
  const { ws, repoA } = makeWorkspace()
  const outsideDir = mkdtempSync(path.join(os.tmpdir(), 'haus-outside-skill-'))
  const outsideFile = path.join(outsideDir, 'outside-agent.md')
  try {
    // Symlinked skill directory — must never be treated as a real skill source
    // (lstat, not stat, at enumeration time — consistent with link.ts's copy
    // step, which already skips symlinks via the same posture).
    writeFileSync(path.join(outsideDir, 'SKILL.md'), '# outside skill\n')
    symlinkSync(outsideDir, path.join(repoA, '.claude', 'skills', 'symlinked-skill'))

    // Symlinked flat agent .md file — must also never be treated as a real source.
    writeFileSync(outsideFile, '# outside agent\n')
    symlinkSync(outsideFile, path.join(repoA, '.claude', 'agents', 'symlinked-agent.md'))

    const linkResult = await runLinkContext(ws, { write: true })
    assert.equal(linkResult.ok, true)
    assert.ok(
      !linkResult.linked.some((e) => e.name === 'symlinked-skill'),
      'symlinked skill directory must be excluded',
    )
    assert.ok(
      !linkResult.linked.some((e) => e.name === 'symlinked-agent'),
      'symlinked flat .md file must be excluded',
    )
    // The real (non-symlinked) assets from the same repo are unaffected.
    assert.ok(linkResult.linked.some((e) => e.name === 'react19-patterns'))
    assert.ok(linkResult.linked.some((e) => e.name === 'frontend-reviewer'))
  } finally {
    rmSync(ws, { recursive: true, force: true })
    rmSync(outsideDir, { recursive: true, force: true })
  }
})

test('runLinkContext removes copies for a member that drops out of the workspace config', async () => {
  const { ws } = makeWorkspace()
  const first = await runLinkContext(ws, { write: true })
  assert.equal(first.ok, true)
  assert.ok(existsSync(path.join(ws, '.claude/skills/api--nestjs-patterns')))

  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-frontend',
      '    path: frontend',
      '    role: frontend',
      'relationships: []',
      '',
    ].join('\n'),
  )

  const second = await runLinkContext(ws, { write: true })
  assert.equal(second.ok, true)
  assert.ok(second.removed.includes('.claude/skills/api--nestjs-patterns'))
  assert.ok(!existsSync(path.join(ws, '.claude/skills/api--nestjs-patterns')), 'orphan removed from disk')
  assert.ok(existsSync(path.join(ws, '.claude/skills/frontend--react19-patterns')), 'remaining member unaffected')

  const manifest = await readManifest(ws)
  assert.ok(!manifest.linkedContext.some((e) => e.repo === 'acme-api'), 'manifest entry removed too')
})

test('runLinkContext removes copies for a member no longer cloned locally', async () => {
  const { ws, repoB } = makeWorkspace()
  const first = await runLinkContext(ws, { write: true })
  assert.equal(first.ok, true)

  rmSync(repoB, { recursive: true, force: true })

  const second = await runLinkContext(ws, { write: true })
  assert.equal(second.ok, true)
  assert.ok(second.skipped.some((s) => s.repo === 'acme-api'))
  assert.ok(!existsSync(path.join(ws, '.claude/skills/api--nestjs-patterns')))
})

test('runLinkContext copies a flat command file', async () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-link-command-'))
  const repoRoot = path.join(ws, 'tools')
  writeCommand(repoRoot, 'deploy', '# deploy command\n')
  writeYaml(
    ws,
    [
      'client: acme-corp',
      'repos:',
      '  - name: acme-tools',
      '    path: tools',
      '    role: auto',
      'relationships: []',
      '',
    ].join('\n'),
  )

  const result = await runLinkContext(ws, { write: true })
  assert.equal(result.ok, true)
  assert.ok(existsSync(path.join(ws, '.claude/commands/tools--deploy.md')))
  assert.equal(
    readFileSync(path.join(ws, '.claude/commands/tools--deploy.md'), 'utf8'),
    '# deploy command\n',
  )
})
