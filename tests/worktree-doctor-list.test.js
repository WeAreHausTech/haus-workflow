// tests/worktree-doctor-list.test.js
//
// Integration coverage for `haus workspace worktree doctor` and `list` — fast,
// side-effect-free health reporting (AC6) plus orphan-registration detection.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runAdd } from '../src/workspace/worktree/add.ts'
import { runDoctor } from '../src/workspace/worktree/doctor.ts'
import { runList } from '../src/workspace/worktree/list.ts'

function tmpDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
}

function buildFixture() {
  const ws = tmpDir('haus-wt-doc-ws-')
  initRepo(ws)
  fs.writeFileSync(
    path.join(ws, 'haus.workspace.yaml'),
    [
      'client: fixture',
      'repos:',
      '  - name: forms',
      '    path: forms',
      '  - name: admin',
      '    path: admin',
      'relationships: []',
      '',
    ].join('\n'),
  )
  git(ws, ['add', '.'])
  git(ws, ['commit', '-qm', 'init workspace'])

  for (const name of ['forms', 'admin']) {
    const dir = path.join(ws, name)
    initRepo(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
    git(dir, ['add', '.'])
    git(dir, ['commit', '-qm', `init ${name}`])
  }

  return { ws, forms: path.join(ws, 'forms'), admin: path.join(ws, 'admin') }
}

function withCwd(dir, fn) {
  const prevCwd = process.cwd()
  process.chdir(dir)
  return Promise.resolve()
    .then(fn)
    .finally(() => process.chdir(prevCwd))
}

test('doctor on the main checkout (no worktree yet) reports no per-member issues, fast', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const start = Date.now()
      const report = await runDoctor()
      const elapsed = Date.now() - start
      assert.equal(report.isWorkspace, true)
      assert.equal(report.inWorkspaceWorktree, false)
      assert.deepEqual(report.problems, [])
      assert.ok(elapsed < 1000, `doctor took ${elapsed}ms, expected < 1000ms`)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('doctor --from-hook semantics: reports every-member-missing but the CLI handler always exits 0 (AC6)', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      // Build an unhydrated, member-less workspace worktree directly with git
      // (bypassing `add`) to simulate "everything missing" inside a real worktree.
      const wtPath = path.join(ws, '.claude', 'worktrees', 'empty-slug')
      git(ws, ['worktree', 'add', wtPath, '-b', 'empty-slug'])

      await withCwd(wtPath, async () => {
        const start = Date.now()
        const report = await runDoctor()
        const elapsed = Date.now() - start
        assert.equal(report.isWorkspace, true)
        assert.equal(report.inWorkspaceWorktree, true)
        assert.equal(report.slug, 'empty-slug')
        assert.equal(report.members.every((m) => m.materialized === false), true)
        assert.ok(report.problems.length >= 2, 'both forms and admin should be reported missing')
        assert.ok(elapsed < 1000, `doctor took ${elapsed}ms, expected < 1000ms`)
      })
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('doctor flags a branch mismatch inside a materialized worktree', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'mismatch-slug', hydrate: false })
      const wtPath = path.join(ws, '.claude', 'worktrees', 'mismatch-slug')
      const wtForms = path.join(wtPath, 'forms')
      git(wtForms, ['checkout', '-qb', 'someone-changed-it'])

      await withCwd(wtPath, async () => {
        const report = await runDoctor()
        const formsCheck = report.members.find((m) => m.id === 'forms')
        assert.equal(formsCheck.branchMismatch, true)
        assert.ok(report.problems.some((p) => p.includes('forms') && p.includes('someone-changed-it')))
      })
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('doctor detects an orphaned member worktree once the workspace worktree dir is gone', async () => {
  const { ws, forms, admin } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'orphan-slug', hydrate: false })
      const wtPath = path.join(ws, '.claude', 'worktrees', 'orphan-slug')

      // Simulate a user manually deleting the workspace worktree dir instead of
      // running `haus workspace worktree remove` — member repos still have it
      // registered.
      fs.rmSync(wtPath, { recursive: true, force: true })

      const report = await runDoctor()
      assert.ok(report.orphans.length >= 2, 'both forms and admin should be reported as orphaned')
      assert.ok(report.orphans.some((o) => o.includes('forms')))
      assert.ok(report.orphans.some((o) => o.includes('admin')))
    })
  } finally {
    // Clean up the dangling registrations so rmSync doesn't leave git state behind.
    execFileSync('git', ['worktree', 'prune'], { cwd: forms, stdio: 'ignore' })
    execFileSync('git', ['worktree', 'prune'], { cwd: admin, stdio: 'ignore' })
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('list reports materialized members with their branch', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'list-slug', hydrate: false })
      const result = await runList()
      assert.equal(result.ok, true)
      const entry = result.worktrees.find((w) => w.slug === 'list-slug')
      assert.ok(entry)
      assert.equal(entry.branch, 'list-slug')
      assert.equal(entry.members.length, 2)
      assert.ok(entry.members.every((m) => m.materialized && m.actualBranch === 'list-slug'))
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('list on a workspace with no worktrees yet returns an empty array, not an error', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runList()
      assert.equal(result.ok, true)
      assert.deepEqual(result.worktrees, [])
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})
