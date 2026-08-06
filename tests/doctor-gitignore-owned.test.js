import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runDoctor } from '../src/commands/doctor.js'

// Task 1.3 (D5) in docs/plans/workspace-detection-and-permissions-fixes.md: `haus
// doctor` must warn when the user's OWN `.claude/`/`.haus-workflow/` (tracked,
// catalog-managed content — skills, agents, WORKFLOW.md) is accidentally gitignored,
// which would make an entire install invisible to git-tracked state. Distinct from
// `doctor-gitignore.test.js`, which covers the opposite concern (machine-local scan
// artifacts that must stay untracked).

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

/** Minimal fixtures so doctor reaches the gitignore-awareness check without noise
 * from earlier (unrelated) checks. */
function writeBaseFixtures(dir) {
  mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(dir, '.haus-workflow/context-map.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repoName: 'gitignore-owned-doctor',
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
  mkdirSync(path.join(dir, '.claude/skills'), { recursive: true })
  writeFileSync(path.join(dir, '.claude/skills/placeholder.md'), '# placeholder\n')
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
    return { output: lines.join('\n'), exitCode: process.exitCode }
  } finally {
    process.exitCode = prevExit
    process.chdir(prevCwd)
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    console.log = origLog
    console.warn = origWarn
  }
}

test('doctor warns when .claude/ is gitignored', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-owned-claude-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    writeFileSync(dir + '/.gitignore', '.claude/\n')

    const { output, exitCode } = await runInDir(dir, () => runDoctor())
    assert.match(output, /\.claude\/ is gitignored/)
    assert.match(output, /(invisible|will not be visible)/)
    assert.match(output, /(skills|agents)/)
    assert.equal(exitCode, 1, 'a gitignored .claude/ is a blocking problem, not just advisory')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor warns when only .claude/commands is gitignored (not just skills/agents)', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-owned-commands-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    mkdirSync(path.join(dir, '.claude/commands'), { recursive: true })
    writeFileSync(path.join(dir, '.claude/commands/placeholder.md'), '# placeholder\n')
    // Ignore commands specifically, leave the rest of .claude/ tracked, so this
    // only passes if HAUS_OWNED_TRACKED_PATHS actually includes .claude/commands.
    writeFileSync(dir + '/.gitignore', '.claude/commands/\n')

    const { output, exitCode } = await runInDir(dir, () => runDoctor())
    assert.match(output, /is gitignored/)
    assert.equal(exitCode, 1, 'a gitignored .claude/commands/ is a blocking problem too')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor warns when .haus-workflow/ is gitignored', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-owned-workflow-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    writeFileSync(dir + '/.gitignore', '.haus-workflow/\n')

    const { output } = await runInDir(dir, () => runDoctor())
    assert.match(output, /\.haus-workflow\/ is gitignored/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor does not false-positive on this repo\'s own documented gitignore pattern', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-owned-clean-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    // Mirrors this repo's own .gitignore: only per-developer settings and worktrees
    // are ignored under .claude/ — never the tracked content itself.
    writeFileSync(
      dir + '/.gitignore',
      ['.claude/settings.json', '.claude/settings.local.json', '.claude/worktrees/', ''].join('\n'),
    )

    const { output } = await runInDir(dir, () => runDoctor())
    assert.match(output, /GITIGNORE \(haus content\): OK/)
    assert.doesNotMatch(output, /is gitignored/)
    assert.doesNotMatch(output, /are gitignored/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor does not false-positive when only unrelated paths are gitignored', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-gi-owned-noop-'))
  try {
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    writeBaseFixtures(dir)
    writeFileSync(dir + '/.gitignore', 'node_modules/\n')

    const { output } = await runInDir(dir, () => runDoctor())
    assert.match(output, /GITIGNORE \(haus content\): OK/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
