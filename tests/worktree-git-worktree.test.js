// tests/worktree-git-worktree.test.js
//
// Low-level git-worktree plumbing (src/workspace/worktree/git-worktree.ts) against
// real temp git repos, following the tests/git-root.test.js pattern.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  addWorktree,
  branchExists,
  currentBranch,
  hasUncommittedChanges,
  hasUnpushedWork,
  isBranchCheckedOutElsewhereError,
  listWorktrees,
  resolveDefaultBranch,
} from '../src/workspace/worktree/git-worktree.ts'

function tmpDir(prefix) {
  // Realpath immediately: macOS's os.tmpdir() is under a symlink (/var -> /private/var),
  // and git always reports absolute paths post-resolution — comparing a raw mkdtemp
  // path against git's output would spuriously mismatch otherwise.
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

describe('isBranchCheckedOutElsewhereError', () => {
  test('matches git\'s "already checked out at" message', () => {
    assert.equal(
      isBranchCheckedOutElsewhereError("fatal: 'feat/x' is already checked out at '/some/path'"),
      true,
    )
  })
  test('matches "already used by worktree"', () => {
    assert.equal(isBranchCheckedOutElsewhereError('branch already used by worktree at /x'), true)
  })
  test('unrelated stderr does not match', () => {
    assert.equal(isBranchCheckedOutElsewhereError('fatal: not a git repository'), false)
  })
})

describe('branchExists / resolveDefaultBranch', () => {
  test('branchExists is true for HEAD\'s branch, false for a nonexistent one', async () => {
    const dir = tmpDir('haus-wt-branch-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      assert.equal(await branchExists(dir, 'main'), true)
      assert.equal(await branchExists(dir, 'does-not-exist'), false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resolveDefaultBranch falls back to local main when no origin/HEAD', async () => {
    const dir = tmpDir('haus-wt-default-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const result = await resolveDefaultBranch(dir)
      assert.deepEqual(result, { ref: 'main', source: 'local-main' })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resolveDefaultBranch falls back to local master when main is absent', async () => {
    const dir = tmpDir('haus-wt-default-master-')
    try {
      fs.mkdirSync(dir, { recursive: true })
      git(dir, ['init', '-q', '-b', 'master'])
      git(dir, ['config', 'user.email', 'test@example.com'])
      git(dir, ['config', 'user.name', 'test'])
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const result = await resolveDefaultBranch(dir)
      assert.deepEqual(result, { ref: 'master', source: 'local-master' })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resolveDefaultBranch is undefined when neither origin/HEAD nor main/master exist', async () => {
    const dir = tmpDir('haus-wt-default-none-')
    try {
      fs.mkdirSync(dir, { recursive: true })
      git(dir, ['init', '-q', '-b', 'trunk'])
      git(dir, ['config', 'user.email', 'test@example.com'])
      git(dir, ['config', 'user.name', 'test'])
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const result = await resolveDefaultBranch(dir)
      assert.equal(result, undefined)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('addWorktree', () => {
  test('creates a new branch from the member default branch when it does not exist yet', async () => {
    const dir = tmpDir('haus-wt-add-create-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const wtPath = path.join(dir, 'wt')
      const outcome = await addWorktree(dir, wtPath, 'feat/new', { preferDefaultBranchFrom: true })
      assert.equal(outcome.ok, true)
      assert.equal(outcome.branchAction, 'create')
      assert.equal(outcome.startPoint, 'main')
      assert.equal(await currentBranch(wtPath), 'feat/new')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('checks out an existing branch instead of re-creating it', async () => {
    const dir = tmpDir('haus-wt-add-checkout-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      git(dir, ['branch', 'feat/existing'])
      const wtPath = path.join(dir, 'wt')
      const outcome = await addWorktree(dir, wtPath, 'feat/existing')
      assert.equal(outcome.ok, true)
      assert.equal(outcome.branchAction, 'checkout')
      assert.equal(outcome.startPoint, undefined)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('branch collision: same branch requested twice yields a clear error, not a guessed suffix', async () => {
    const dir = tmpDir('haus-wt-add-collision-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const first = await addWorktree(dir, path.join(dir, 'wt1'), 'feat/dup', {
        preferDefaultBranchFrom: true,
      })
      assert.equal(first.ok, true)

      const second = await addWorktree(dir, path.join(dir, 'wt2'), 'feat/dup', {
        preferDefaultBranchFrom: true,
      })
      assert.equal(second.ok, false)
      assert.equal(second.checkedOutElsewhere, true)
      // No suffixed branch worktree should exist.
      assert.equal(fs.existsSync(path.join(dir, 'wt2')), false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('listWorktrees', () => {
  test('parses porcelain output for main + linked worktrees', async () => {
    const dir = tmpDir('haus-wt-list-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const wtPath = path.join(dir, 'linked')
      git(dir, ['worktree', 'add', wtPath, '-b', 'feat/linked'])

      const entries = await listWorktrees(dir)
      assert.equal(entries.length, 2)
      const linked = entries.find((e) => path.resolve(e.path) === path.resolve(wtPath))
      assert.ok(linked)
      assert.equal(linked.branch, 'feat/linked')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('hasUncommittedChanges / hasUnpushedWork', () => {
  test('clean repo reports no uncommitted changes and no unpushed work (no upstream, HEAD == default)', async () => {
    const dir = tmpDir('haus-wt-clean-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      assert.equal(await hasUncommittedChanges(dir), false)
      const unpushed = await hasUnpushedWork(dir)
      assert.equal(unpushed.unpushed, false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an untracked file counts as uncommitted changes', async () => {
    const dir = tmpDir('haus-wt-dirty-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      fs.writeFileSync(path.join(dir, 'scratch.txt'), 'x')
      assert.equal(await hasUncommittedChanges(dir), true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a commit beyond the default branch with no upstream counts as unpushed', async () => {
    const dir = tmpDir('haus-wt-ahead-')
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      git(dir, ['checkout', '-qb', 'feat/ahead'])
      git(dir, ['commit', '--allow-empty', '-qm', 'extra work'])
      const unpushed = await hasUnpushedWork(dir)
      assert.equal(unpushed.unpushed, true)
      assert.match(unpushed.reason, /no upstream/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
