// tests/worktree-remove.test.js
//
// Integration coverage for `haus workspace worktree remove` — the
// uncommitted/unpushed-work refusal (WORKFLOW.md NEVER-rule-equivalent per the
// plan doc) and clean-registration removal, against real temp git repos.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runAdd } from '../src/workspace/worktree/add.ts'
import { listWorktrees } from '../src/workspace/worktree/git-worktree.ts'
import { runRemove } from '../src/workspace/worktree/remove.ts'

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
  const ws = tmpDir('haus-wt-rm-ws-')
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

test('remove refuses on uncommitted work without --force, naming exactly what it found (AC4)', async () => {
  const { ws, forms } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const added = await runAdd({ slug: 'dirty-slug', hydrate: false })
      assert.equal(added.ok, true)

      const wtForms = path.join(ws, '.claude', 'worktrees', 'dirty-slug', 'forms')
      fs.writeFileSync(path.join(wtForms, 'untracked.txt'), 'oops')

      const result = await runRemove({ slug: 'dirty-slug' })
      assert.equal(result.ok, false)
      assert.equal(result.blocked, true)
      const formsBlocker = result.blockers.find((b) => b.repo === 'forms')
      assert.ok(formsBlocker, 'forms should be named as a blocker')
      assert.match(formsBlocker.reason, /uncommitted/)

      // Nothing was removed.
      assert.ok(fs.existsSync(wtForms))
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(forms, { recursive: true, force: true })
  }
})

test('remove refuses on unpushed work (no upstream, HEAD advanced past default branch)', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const added = await runAdd({ slug: 'ahead-slug', hydrate: false })
      assert.equal(added.ok, true)
      const wtAdmin = path.join(ws, '.claude', 'worktrees', 'ahead-slug', 'admin')
      git(wtAdmin, ['commit', '--allow-empty', '-qm', 'extra unpushed work'])

      const result = await runRemove({ slug: 'ahead-slug' })
      assert.equal(result.ok, false)
      assert.equal(result.blocked, true)
      const adminBlocker = result.blockers.find((b) => b.repo === 'admin')
      assert.ok(adminBlocker, 'admin should be named as a blocker')
      assert.match(adminBlocker.reason, /no upstream/)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('remove --dry-run reports what would be removed without removing anything', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'preview-slug', hydrate: false })
      const result = await runRemove({ slug: 'preview-slug', dryRun: true })
      assert.equal(result.ok, true)
      assert.equal(result.dryRun, true)
      assert.deepEqual(result.wouldRemove.sort(), ['(workspace)', 'admin', 'forms'])
      assert.ok(fs.existsSync(path.join(ws, '.claude', 'worktrees', 'preview-slug')))
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('remove --force removes every worktree and leaves no orphaned registrations (AC5)', async () => {
  const { ws, forms, admin } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'force-slug', hydrate: false })
      const wtForms = path.join(ws, '.claude', 'worktrees', 'force-slug', 'forms')
      fs.writeFileSync(path.join(wtForms, 'untracked.txt'), 'dirty, but --force bypasses it')

      const result = await runRemove({ slug: 'force-slug', force: true })
      assert.equal(result.ok, true)
      assert.equal(result.failed.length, 0)

      assert.equal(fs.existsSync(path.join(ws, '.claude', 'worktrees', 'force-slug')), false)

      const wsEntries = await listWorktrees(ws)
      assert.equal(wsEntries.length, 1, 'only the main workspace checkout should remain registered')
      const formsEntries = await listWorktrees(forms)
      assert.equal(formsEntries.length, 1, 'only the main forms checkout should remain registered')
      const adminEntries = await listWorktrees(admin)
      assert.equal(adminEntries.length, 1, 'only the main admin checkout should remain registered')
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('remove --force still unregisters a member dropped from config since add, via absPath captured in state', async () => {
  const { ws, forms, admin } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'dropped-slug', hydrate: false })

      // Simulate the member dropping out of the workspace config after `add`
      // (renamed/removed) — remove must still find it via absPath recorded in
      // .haus-worktree.json at add time, not just readMembers().
      fs.writeFileSync(
        path.join(ws, 'haus.workspace.yaml'),
        ['client: fixture', 'repos:', '  - name: admin', '    path: admin', 'relationships: []', ''].join(
          '\n',
        ),
      )

      const result = await runRemove({ slug: 'dropped-slug', force: true })
      assert.equal(result.ok, true)
      assert.equal(result.failed.length, 0, 'forms should still be unregistered via its recorded absPath')

      const formsEntries = await listWorktrees(forms)
      assert.equal(
        formsEntries.length,
        1,
        'no orphaned registration should remain for the dropped member',
      )
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(forms, { recursive: true, force: true })
    fs.rmSync(admin, { recursive: true, force: true })
  }
})

test('remove blocks by default on a dropped member with no recorded absPath (pre-fix state file)', async () => {
  const { ws, forms, admin } = buildFixture()
  try {
    await withCwd(ws, async () => {
      await runAdd({ slug: 'legacy-slug', hydrate: false })

      // Simulate a .haus-worktree.json written before absPath tracking existed.
      const statePath = path.join(ws, '.claude', 'worktrees', 'legacy-slug', '.haus-worktree.json')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      for (const m of state.members) delete m.absPath
      fs.writeFileSync(statePath, JSON.stringify(state))

      // Drop 'forms' from config so it can't be resolved from readMembers() either.
      fs.writeFileSync(
        path.join(ws, 'haus.workspace.yaml'),
        ['client: fixture', 'repos:', '  - name: admin', '    path: admin', 'relationships: []', ''].join(
          '\n',
        ),
      )

      const result = await runRemove({ slug: 'legacy-slug' })
      assert.equal(result.ok, false)
      assert.equal(result.blocked, true)
      const formsBlocker = result.blockers.find((b) => b.repo === 'forms')
      assert.ok(formsBlocker, 'the unresolvable dropped member must block, never silently proceed')
      assert.match(formsBlocker.reason, /cannot verify|unregister/)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(forms, { recursive: true, force: true })
    fs.rmSync(admin, { recursive: true, force: true })
  }
})

test('remove reports a clear error for an unknown slug', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runRemove({ slug: 'never-existed' })
      assert.equal(result.ok, false)
      assert.match(result.error, /No workspace worktree found/)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})
