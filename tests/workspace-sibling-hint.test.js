import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runScan } from '../src/commands/scan.ts'
import { runSetupCore } from '../src/claude/setup-core.ts'
import { hasMultipleSiblingRepos, SIBLING_REPO_WARNING } from '../src/scanner/sibling-repos.ts'

// D2 — cross-reference `workspace discover` from `setup-project`/`scan`. Fixed per
// docs/plans/workspace-detection-and-permissions-fixes.md Task 3.1:
//  `haus scan` and `haus setup-project` reuse discoverRepos' marker logic
//  (src/commands/workspace/discover.ts) to detect 2+ sibling repo roots nested
//  below the current root, and suggest `haus workspace discover` instead of (or
//  in addition to) running setup-project/scan per repo, blind to the workspace
//  pattern.

const NORMAL_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

function tmpDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true })
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
}

/**
 * Runs `fn` with cwd chdir'd into `dir` and HAUS_FIXTURE_CATALOG pointed at
 * `catalogPath`, muting console noise and restoring all global state afterward —
 * mirrors the pattern in tests/scan-setup-zero-signal-guard.test.js.
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

/** Workspace root with 2 independent sibling repos, each with their own `.git`. */
function makeSiblingWorkspace() {
  const ws = tmpDir('haus-sibling-ws-')
  initRepo(path.join(ws, 'repo-a'))
  writeFileSync(
    path.join(ws, 'repo-a', 'package.json'),
    JSON.stringify({ name: 'repo-a', dependencies: { react: '19.0.0' } }),
  )
  initRepo(path.join(ws, 'repo-b'))
  writeFileSync(
    path.join(ws, 'repo-b', 'package.json'),
    JSON.stringify({ name: 'repo-b', dependencies: { express: '4.0.0' } }),
  )
  return ws
}

test('hasMultipleSiblingRepos is true for a root with 2+ independent sibling repos', async () => {
  const ws = makeSiblingWorkspace()
  try {
    assert.equal(await hasMultipleSiblingRepos(ws), true)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('hasMultipleSiblingRepos is false for a normal single-repo project', async () => {
  const dir = tmpDir('haus-single-repo-')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'solo-app', dependencies: { react: '19.0.0' } }),
  )
  try {
    assert.equal(await hasMultipleSiblingRepos(dir), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('hasMultipleSiblingRepos is false for a monorepo (single .git, multiple nested package.json)', async () => {
  const root = tmpDir('haus-monorepo-')
  initRepo(root)
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'monorepo-root', private: true, workspaces: ['packages/*'] }),
  )
  mkdirSync(path.join(root, 'packages', 'api'), { recursive: true })
  writeFileSync(
    path.join(root, 'packages', 'api', 'package.json'),
    JSON.stringify({ name: 'api', dependencies: { express: '4.0.0' } }),
  )
  mkdirSync(path.join(root, 'packages', 'web'), { recursive: true })
  writeFileSync(
    path.join(root, 'packages', 'web', 'package.json'),
    JSON.stringify({ name: 'web', dependencies: { react: '19.0.0' } }),
  )
  try {
    // Nested package.json without their own .git collapse into the monorepo root —
    // not independent sibling repos, so no warning should fire.
    assert.equal(await hasMultipleSiblingRepos(root), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('haus scan prints the sibling-repo WARN when run inside a directory with 2+ sibling .git roots', async () => {
  const ws = makeSiblingWorkspace()
  try {
    const { lines } = await runInDir(ws, NORMAL_CATALOG, () => runScan({}))
    const warnLine = lines.find((l) => l.includes(SIBLING_REPO_WARNING))
    assert.ok(warnLine, `expected the sibling-repo WARN line, got:\n${lines.join('\n')}`)
    assert.match(warnLine, /haus workspace discover/)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('haus scan does not print the sibling-repo WARN for a normal single-repo project', async () => {
  const dir = tmpDir('haus-scan-solo-')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'solo-app', dependencies: { react: '19.0.0' } }),
  )
  try {
    const { lines } = await runInDir(dir, NORMAL_CATALOG, () => runScan({}))
    assert.ok(
      !lines.some((l) => l.includes(SIBLING_REPO_WARNING)),
      `did not expect the sibling-repo WARN, got:\n${lines.join('\n')}`,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setup-project surfaces the sibling-repo WARN in its warnings when 2+ sibling repos are detected', async () => {
  const ws = makeSiblingWorkspace()
  try {
    const { result } = await runInDir(ws, NORMAL_CATALOG, () =>
      runSetupCore(ws, { json: true, apply: false }),
    )
    assert.ok(
      result.warnings.some((w) => w === SIBLING_REPO_WARNING),
      `expected the sibling-repo WARN in setup-project's warnings, got:\n${JSON.stringify(result.warnings, null, 2)}`,
    )
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})
