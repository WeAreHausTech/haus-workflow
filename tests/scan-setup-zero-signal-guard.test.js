import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runScan } from '../src/commands/scan.ts'
import { runSetupCore } from '../src/claude/setup-core.ts'

// D1 — explicit zero-signal / worktree guard. Fixed per
// docs/plans/workspace-detection-and-permissions-fixes.md Task 1.2:
//  1. `haus scan` now prints a WARN line when detectionStatus is 'unknown' (was silent).
//  2. That warning (and setup-project's) names the linked-worktree condition explicitly
//     when resolveRoots() reports isLinkedWorktree — a false zero-signal reading from
//     inside a `git worktree` checkout shouldn't be mistaken for "no stack at all".
//  3. `setup-project` refuses to write recommendation.json/haus.lock.json when literally
//     zero catalog items matched (not merely zero detected stacks), behind --force.
// See docs/decisions/ (zero-signal setup guard ADR) for the policy rationale.

const NORMAL_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')
const EMPTY_CATALOG = path.resolve('tests/fixtures/catalog/empty-manifest.json')

function tmpDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

function initRepo(dir) {
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
}

/** Zero-signal project: no package.json, no recognized markers of any kind. */
function writeZeroSignalProject(dir) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), '# nothing to detect here\n')
}

/**
 * Runs `fn` with cwd chdir'd into `dir` and HAUS_FIXTURE_CATALOG pointed at
 * `catalogPath`, muting console noise and restoring all global state afterward
 * (cwd, HAUS_FIXTURE_CATALOG, process.exitCode, console.log/warn/error) — mirrors
 * the pattern already used by tests/doctor-gitignore.test.js and
 * tests/workspace-setup.test.js's withExitCode.
 */
async function runInDir(dir, catalogPath, fn) {
  const prevCwd = process.cwd()
  const prevExit = process.exitCode
  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  process.env.HAUS_FIXTURE_CATALOG = catalogPath
  const lines = []
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...args) => lines.push(args.join(' '))
  console.warn = (...args) => lines.push(args.join(' '))
  console.error = (...args) => lines.push(args.join(' '))
  process.exitCode = 0
  try {
    process.chdir(dir)
    const result = await fn()
    return { lines, result, exitCode: process.exitCode }
  } finally {
    process.chdir(prevCwd)
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    process.exitCode = prevExit
    console.log = orig.log
    console.warn = orig.warn
    console.error = orig.error
  }
}

test('haus scan prints a WARN line when detectionStatus is unknown (previously silent)', async () => {
  const dir = tmpDir('haus-scan-unknown-')
  writeZeroSignalProject(dir)
  try {
    const { lines } = await runInDir(dir, NORMAL_CATALOG, () => runScan({}))
    const warnLine = lines.find((l) => l.includes('- WARN:'))
    assert.ok(warnLine, `expected a WARN line, got:\n${lines.join('\n')}`)
    assert.match(warnLine, /Stack not recognised/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('haus scan on a recognised repo does not print the unknown-detection WARN', async () => {
  const dir = tmpDir('haus-scan-known-')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'known-app', dependencies: { next: '15.0.0', react: '19.0.0' } }),
  )
  try {
    const { lines } = await runInDir(dir, NORMAL_CATALOG, () => runScan({}))
    assert.ok(
      !lines.some((l) => l.includes('Stack not recognised')),
      `did not expect the unknown-detection WARN, got:\n${lines.join('\n')}`,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setup-project refuses to write recommendation.json when zero catalog items matched at all, without --force', async () => {
  const dir = tmpDir('haus-zero-catalog-')
  writeZeroSignalProject(dir)
  try {
    const { result, exitCode, lines } = await runInDir(dir, EMPTY_CATALOG, () =>
      runSetupCore(dir, { json: true, apply: false }),
    )
    assert.equal(result.recommendedCount, 0)
    assert.deepEqual(result.written, [])
    assert.equal(
      existsSync(path.join(dir, '.haus-workflow/recommendation.json')),
      false,
      'recommendation.json must not be written without --force on a true zero-catalog-match',
    )
    assert.equal(exitCode, 1, 'refusal must set a non-zero exit code')
    assert.ok(
      result.warnings.some((w) => w.includes('--force')),
      `expected a warning pointing at --force, got:\n${lines.join('\n')}`,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setup-project --force writes recommendation.json and haus.lock.json when zero catalog items matched at all', async () => {
  const dir = tmpDir('haus-zero-catalog-force-')
  writeZeroSignalProject(dir)
  try {
    const { result, exitCode } = await runInDir(dir, EMPTY_CATALOG, () =>
      runSetupCore(dir, {
        json: false,
        apply: true,
        dryRun: false,
        force: true,
        confirm: async () => true,
      }),
    )
    assert.equal(exitCode, 0, 'a forced write must not leave a non-zero exit code')
    assert.ok(
      existsSync(path.join(dir, '.haus-workflow/recommendation.json')),
      'recommendation.json must be written when --force is passed',
    )
    const rec = JSON.parse(
      readFileSync(path.join(dir, '.haus-workflow/recommendation.json'), 'utf8'),
    )
    assert.deepEqual(rec.recommended, [])
    assert.ok(
      existsSync(path.join(dir, '.haus-workflow/haus.lock.json')),
      'haus.lock.json must be written when --force is passed and apply proceeds',
    )
    assert.ok(result.written.length > 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a project with zero detected stacks but a stack-agnostic catalog match still writes normally, no --force needed', async () => {
  const dir = tmpDir('haus-agnostic-match-')
  writeZeroSignalProject(dir)
  try {
    const { result, exitCode } = await runInDir(dir, NORMAL_CATALOG, () =>
      runSetupCore(dir, { json: true, apply: false }),
    )
    const contextMap = JSON.parse(
      readFileSync(path.join(dir, '.haus-workflow/context-map.json'), 'utf8'),
    )
    // Confirm this really is the "zero detected stacks" case, not a false positive.
    assert.equal(contextMap.detectionStatus, 'unknown')
    assert.deepEqual(contextMap.repoRoles, [])

    assert.ok(
      result.recommendedCount >= 1,
      'the fixture catalog default (stack-agnostic) item should still match',
    )
    assert.ok(
      existsSync(path.join(dir, '.haus-workflow/recommendation.json')),
      'recommendation.json must be written normally — no --force required for a stack-agnostic-only match',
    )
    assert.notEqual(exitCode, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setup-project names the linked-worktree condition when detectionStatus is unknown inside a linked worktree', async () => {
  const main = tmpDir('haus-wt-main-')
  try {
    initRepo(main)
    git(main, ['commit', '--allow-empty', '-qm', 'init'])
    const wt = path.join(main, 'wt')
    git(main, ['worktree', 'add', wt, '-b', 'feat/zero-signal'])
    writeZeroSignalProject(wt)

    const { result } = await runInDir(wt, NORMAL_CATALOG, () =>
      runSetupCore(wt, { json: true, apply: false }),
    )
    const contextMap = JSON.parse(
      readFileSync(path.join(wt, '.haus-workflow/context-map.json'), 'utf8'),
    )
    assert.equal(contextMap.detectionStatus, 'unknown')
    assert.ok(
      result.warnings.some((w) => /git worktree/i.test(w)),
      `expected a warning naming the worktree condition, got:\n${JSON.stringify(result.warnings, null, 2)}`,
    )
  } finally {
    fs.rmSync(main, { recursive: true, force: true })
  }
})
