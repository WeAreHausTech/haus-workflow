// tests/worktree-add.test.js
//
// Integration coverage for `haus workspace worktree add` against a real
// multi-repo fixture (a workspace/meta repo + 2 independent member git repos),
// following the tests/git-root.test.js / tests/scanner-nested-repo-boundary.test.js
// pattern of real temp git repos rather than mocks.
//
// Full end-to-end (git worktree + real hydration) is exercised with npm/
// package-lock.json (the only package manager guaranteed present in this
// sandbox — `which yarn pnpm npm dotnet composer` was checked ahead of writing
// this: yarn/pnpm/npm are present, dotnet is not, composer is present but
// exercising it here would need a real PHP toolchain + registry access this
// sandbox doesn't guarantee). The lockfile -> command *dispatch* logic for
// yarn/pnpm/composer/dotnet is unit-tested directly in
// tests/worktree-install-plan.test.js (pure function, no process access) —
// this file's job is proving the git-worktree + CoW + install-exec plumbing
// works end-to-end for at least one real installer, offline (zero
// dependencies in the fixture, so `npm install` never touches the network).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runAdd } from '../src/workspace/worktree/add.ts'
import { detectCowStrategy } from '../src/workspace/worktree/cow-copy.ts'
import { branchExists } from '../src/workspace/worktree/git-worktree.ts'
import { readWorktreeState } from '../src/workspace/worktree/state.ts'

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

/**
 * Builds: ws/ (meta repo, haus.workspace.yaml or repos.manifest.json) with two
 * independent member repos, forms/ and admin/. admin resolves `../forms/src/index.js`
 * by relative path with no registry fallback — mirrors the vafab-forms-admin /
 * vafab-forms sibling-resolution case the plan doc calls out (pitfall #3).
 */
function buildFixture({ manifestOnly = false } = {}) {
  const ws = tmpDir('haus-wt-add-ws-')
  initRepo(ws)

  if (manifestOnly) {
    fs.writeFileSync(
      path.join(ws, 'repos.manifest.json'),
      JSON.stringify({ repos: [{ id: 'forms', folder: 'forms' }, { id: 'admin', folder: 'admin' }] }),
    )
  } else {
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
  }
  git(ws, ['add', '.'])
  git(ws, ['commit', '-qm', 'init workspace'])

  const forms = path.join(ws, 'forms')
  initRepo(forms)
  fs.writeFileSync(
    path.join(forms, 'package.json'),
    JSON.stringify({ name: '@fixture/forms', version: '1.0.0', main: 'src/index.js' }),
  )
  fs.mkdirSync(path.join(forms, 'src'))
  fs.writeFileSync(
    path.join(forms, 'src', 'index.js'),
    'module.exports = { greet: () => "hello-from-forms" }\n',
  )
  git(forms, ['add', '.'])
  git(forms, ['commit', '-qm', 'init forms'])
  // Untracked hydration-target content, standing in for a real node_modules —
  // proves the CoW clone step copies present-but-untracked content that
  // `git worktree add` itself never checks out.
  fs.mkdirSync(path.join(forms, 'node_modules', 'dummy'), { recursive: true })
  fs.writeFileSync(path.join(forms, 'node_modules', 'dummy', 'pkg.txt'), 'original-content')

  const admin = path.join(ws, 'admin')
  initRepo(admin)
  fs.writeFileSync(
    path.join(admin, 'package.json'),
    JSON.stringify({ name: 'admin', version: '1.0.0' }),
  )
  fs.writeFileSync(
    path.join(admin, 'package-lock.json'),
    JSON.stringify({
      name: 'admin',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'admin', version: '1.0.0' } },
    }),
  )
  fs.writeFileSync(
    path.join(admin, 'smoke.js'),
    "const forms = require('../forms/src/index.js')\nconsole.log(forms.greet())\n",
  )
  git(admin, ['add', '.'])
  git(admin, ['commit', '-qm', 'init admin'])

  return { ws, forms, admin }
}

function withCwd(dir, fn) {
  const prevCwd = process.cwd()
  process.chdir(dir)
  return Promise.resolve()
    .then(fn)
    .finally(() => process.chdir(prevCwd))
}

test('add creates the workspace worktree + one member worktree per member, all on the mirrored branch (AC1)', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'feature-x' })
      assert.equal(result.ok, true)
      assert.equal(result.branch, 'feature-x')

      const wtRoot = path.join(ws, '.claude', 'worktrees', 'feature-x')
      assert.ok(fs.existsSync(wtRoot))
      assert.ok(fs.existsSync(path.join(wtRoot, 'forms')))
      assert.ok(fs.existsSync(path.join(wtRoot, 'admin')))

      assert.equal(git(wtRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'feature-x')
      assert.equal(git(path.join(wtRoot, 'forms'), ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'feature-x')
      assert.equal(git(path.join(wtRoot, 'admin'), ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'feature-x')

      const state = await readWorktreeState(wtRoot)
      assert.equal(state.slug, 'feature-x')
      assert.equal(state.branch, 'feature-x')
      assert.deepEqual(
        state.members.map((m) => m.id).sort(),
        ['admin', 'forms'],
      )
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('works on a workspace with no haus.workspace.yaml, via the repos.manifest.json bridge (AC7)', async () => {
  const { ws } = buildFixture({ manifestOnly: true })
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'manifest-only' })
      assert.equal(result.ok, true)
      const wtRoot = path.join(ws, '.claude', 'worktrees', 'manifest-only')
      assert.ok(fs.existsSync(path.join(wtRoot, 'forms')))
      assert.ok(fs.existsSync(path.join(wtRoot, 'admin')))
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('add --dry-run writes nothing and reports exactly what would happen (AC3)', async () => {
  const { ws, forms } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'dry-slug', dryRun: true })
      assert.equal(result.ok, true)
      assert.equal(result.dryRun, true)
      assert.equal(result.workspaceWorktree.branchAction, 'create')
      assert.deepEqual(
        result.members.map((m) => m.status),
        ['planned', 'planned'],
      )

      assert.equal(fs.existsSync(path.join(ws, '.claude', 'worktrees', 'dry-slug')), false)
      assert.equal(await branchExists(ws, 'dry-slug'), false)
      assert.equal(await branchExists(forms, 'dry-slug'), false)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('hydration produces a runnable repo (npm install, offline) and satisfies sibling resolution (AC2, pitfall #3)', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'hydrate-slug' })
      assert.equal(result.ok, true)

      const adminResult = result.members.find((m) => m.member === 'admin')
      assert.ok(adminResult.hydration, 'admin should have been hydrated')
      assert.equal(adminResult.hydration.install.plan.manager, 'npm')
      assert.equal(adminResult.hydration.install.ran, true)
      assert.equal(adminResult.hydration.install.ok, true)

      const wtAdmin = path.join(ws, '.claude', 'worktrees', 'hydrate-slug', 'admin')
      // Sibling resolution: admin's smoke.js requires '../forms/src/index.js' with no
      // registry fallback — this only resolves once both members are materialized
      // side by side inside the same workspace worktree.
      const stdout = execFileSync('node', ['smoke.js'], { cwd: wtAdmin }).toString().trim()
      assert.equal(stdout, 'hello-from-forms')
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('CoW clone: content is identical after copy, and writes to the clone do not leak back to the source', async (t) => {
  // cowCopyDir() deliberately skips the copy attempt ENTIRELY on an unsupported
  // filesystem (ext4 and friends) rather than letting --reflink=auto silently
  // fall back to a full copy — see src/workspace/worktree/cow-copy.ts. On CI
  // Linux runners (typically ext4), the dummy node_modules fixture file this
  // test asserts on is therefore never cloned at all (hydration falls straight
  // through to install-reconciliation instead) — skip rather than false-fail.
  const strategy = await detectCowStrategy(os.tmpdir())
  if (strategy === 'unsupported' || strategy === 'unknown-platform') {
    t.skip(`CoW unsupported on this filesystem (${strategy}) — cowCopyDir() skips the copy entirely by design`)
    return
  }

  const { ws, forms } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'cow-slug' })
      assert.equal(result.ok, true)

      const clonedFile = path.join(
        ws,
        '.claude',
        'worktrees',
        'cow-slug',
        'forms',
        'node_modules',
        'dummy',
        'pkg.txt',
      )
      assert.ok(fs.existsSync(clonedFile))
      assert.equal(fs.readFileSync(clonedFile, 'utf8'), 'original-content')

      fs.writeFileSync(clonedFile, 'changed-in-worktree')
      const original = fs.readFileSync(path.join(forms, 'node_modules', 'dummy', 'pkg.txt'), 'utf8')
      assert.equal(original, 'original-content', 'source must be unaffected by a write to the clone')
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('branch collision is caught with a clear error, never a guessed suffix', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const first = await runAdd({ slug: 'collide-a', branch: 'shared-branch' })
      assert.equal(first.ok, true)

      const second = await runAdd({ slug: 'collide-b', branch: 'shared-branch' })
      assert.equal(second.ok, false)
      assert.match(second.error, /already checked out elsewhere/)
      assert.equal(fs.existsSync(path.join(ws, '.claude', 'worktrees', 'collide-b')), false)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('unknown --only repo name is a clear error, not a silently empty run', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'x', only: ['does-not-exist'] })
      assert.equal(result.ok, false)
      assert.match(result.error, /Unknown --only/)
      assert.equal(fs.existsSync(path.join(ws, '.claude', 'worktrees', 'x')), false)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('--no-hydrate skips hydration entirely (no install, no CoW clone)', async () => {
  const { ws } = buildFixture()
  try {
    await withCwd(ws, async () => {
      const result = await runAdd({ slug: 'no-hydrate-slug', hydrate: false })
      assert.equal(result.ok, true)
      for (const m of result.members) assert.equal(m.hydration, undefined)
      const clonedNodeModules = path.join(
        ws,
        '.claude',
        'worktrees',
        'no-hydrate-slug',
        'forms',
        'node_modules',
      )
      assert.equal(fs.existsSync(clonedNodeModules), false)
    })
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})
