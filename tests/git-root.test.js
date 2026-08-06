// tests/git-root.test.js
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { resolveRoots } from '../src/utils/git-root.ts'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haus-gitroot-'))
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

function initRepo(dir) {
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
}

describe('resolveRoots', () => {
  test('git binary unspawnable (e.g. minimal environment): safe all-cwd fallback, never throws', async () => {
    // No mocking precedent in this codebase for exec calls — real PATH
    // manipulation is the direct way to reproduce "git can't be spawned at
    // all" (execa throws only for this case, not for a git command that ran
    // and exited non-zero). Restored in `finally` regardless of outcome.
    const dir = tmpDir()
    const originalPath = process.env.PATH
    try {
      initRepo(dir) // still a real git repo — proves the fallback isn't just "non-git dir"
      process.env.PATH = ''
      await assert.doesNotReject(async () => {
        const info = await resolveRoots(dir)
        assert.equal(info.isGitRepo, false)
        assert.equal(info.cwd, dir)
        assert.equal(info.repoRoot, dir)
      })
    } finally {
      process.env.PATH = originalPath
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('non-git directory: safe all-cwd fallback, never throws', async () => {
    const dir = tmpDir()
    try {
      const info = await resolveRoots(dir)
      assert.equal(info.isGitRepo, false)
      assert.equal(info.cwd, dir)
      assert.equal(info.repoRoot, dir)
      assert.equal(info.mainRoot, dir)
      assert.equal(info.gitDir, '')
      assert.equal(info.gitCommonDir, '')
      assert.equal(info.isLinkedWorktree, false)
      assert.equal(info.worktreeName, null)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('bare repo: safe all-cwd fallback, never throws', async () => {
    const dir = tmpDir()
    try {
      git(dir, ['init', '--bare', '-q'])
      const info = await resolveRoots(dir)
      // A bare repo has no working tree, so `--show-toplevel` fails —
      // resolveRoots must fall back rather than throw or report a bogus root.
      assert.equal(info.isGitRepo, false)
      assert.equal(info.repoRoot, dir)
      assert.equal(info.mainRoot, dir)
      assert.equal(info.isLinkedWorktree, false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('main checkout: gitDir === gitCommonDir, not a linked worktree', async () => {
    const dir = tmpDir()
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])

      const info = await resolveRoots(dir)
      assert.equal(info.isGitRepo, true)
      assert.equal(info.isLinkedWorktree, false)
      assert.equal(info.worktreeName, null)
      assert.equal(path.resolve(info.repoRoot), path.resolve(fs.realpathSync(dir)))
      assert.equal(info.mainRoot, info.repoRoot)
      assert.equal(info.gitDir, info.gitCommonDir)
      assert.ok(path.isAbsolute(info.gitDir))
      assert.ok(path.isAbsolute(info.gitCommonDir))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('linked worktree: gitDir !== gitCommonDir, mainRoot points at the main checkout', async () => {
    const dir = tmpDir()
    try {
      initRepo(dir)
      git(dir, ['commit', '--allow-empty', '-qm', 'init'])
      const wtPath = path.join(dir, 'wt')
      git(dir, ['worktree', 'add', wtPath, '-b', 'feat/x'])

      const info = await resolveRoots(wtPath)
      assert.equal(info.isGitRepo, true)
      assert.equal(info.isLinkedWorktree, true)
      assert.equal(path.resolve(info.repoRoot), path.resolve(fs.realpathSync(wtPath)))
      // mainRoot must resolve to the main checkout, not the worktree directory.
      assert.equal(path.resolve(info.mainRoot), path.resolve(fs.realpathSync(dir)))
      assert.equal(info.worktreeName, 'wt')
      assert.notEqual(info.gitDir, info.gitCommonDir)
      assert.ok(info.gitDir.includes(path.join('.git', 'worktrees', 'wt')))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('submodule: gitDir under .git/modules, mainRoot must NOT be derived via dirname', async () => {
    const parent = tmpDir()
    const upstream = tmpDir()
    try {
      // Bare upstream repo the submodule points at. HEAD's default branch name
      // (main vs master) depends on the runner's git version/config — set it
      // explicitly so `submodule add`'s checkout doesn't land on an empty
      // "branch yet to be born" when the CI runner's default differs from main.
      git(upstream, ['init', '--bare', '-q'])
      git(upstream, ['symbolic-ref', 'HEAD', 'refs/heads/main'])

      const seed = tmpDir()
      initRepo(seed)
      fs.writeFileSync(path.join(seed, 'file.txt'), 'x')
      git(seed, ['add', '.'])
      git(seed, ['commit', '-qm', 'seed'])
      git(seed, ['push', upstream, 'HEAD:refs/heads/main'])
      fs.rmSync(seed, { recursive: true, force: true })

      initRepo(parent)
      git(parent, ['commit', '--allow-empty', '-qm', 'init'])
      git(parent, ['-c', 'protocol.file.allow=always', 'submodule', 'add', upstream, 'sub'])
      git(parent, ['commit', '-qm', 'add submodule'])

      const subPath = path.join(parent, 'sub')
      const info = await resolveRoots(subPath)
      assert.equal(info.isGitRepo, true)
      assert.equal(path.resolve(info.repoRoot), path.resolve(fs.realpathSync(subPath)))
      // A submodule's gitDir lives at <parent>/.git/modules/sub — gitCommonDir does
      // NOT end in plain `.git`, so mainRoot must fall back to repoRoot, never
      // dirname(gitCommonDir) (which would resolve to <parent>/.git/modules).
      assert.notEqual(path.basename(info.gitCommonDir), '.git')
      assert.equal(info.mainRoot, info.repoRoot)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
      fs.rmSync(upstream, { recursive: true, force: true })
    }
  })

  test('defaults start to process.cwd() when omitted', async () => {
    const info = await resolveRoots()
    assert.equal(info.cwd, process.cwd())
  })
})
