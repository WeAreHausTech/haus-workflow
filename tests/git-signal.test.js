// tests/git-signal.test.js
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { readChangedFiles } from '../src/recommender/git-signal.js'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haus-gitsig-'))
}

// Serialize: all tests mutate process.env.HAUS_DISABLE_GIT_SIGNALS (shared global).
// Concurrent runs race — disable test sets =1 while siblings expect it unset → [] flake.
describe('git-signal', { concurrency: false }, () => {
  test('returns [] when HAUS_DISABLE_GIT_SIGNALS=1', async () => {
    const prev = process.env.HAUS_DISABLE_GIT_SIGNALS
    process.env.HAUS_DISABLE_GIT_SIGNALS = '1'
    const dir = tmpDir()
    try {
      assert.deepEqual(await readChangedFiles(dir), [])
    } finally {
      if (prev === undefined) delete process.env.HAUS_DISABLE_GIT_SIGNALS
      else process.env.HAUS_DISABLE_GIT_SIGNALS = prev
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns [] in a non-git directory', async () => {
    delete process.env.HAUS_DISABLE_GIT_SIGNALS
    const dir = tmpDir()
    try {
      assert.deepEqual(await readChangedFiles(dir), [])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns unstaged changed files, sorted', async () => {
    delete process.env.HAUS_DISABLE_GIT_SIGNALS
    const dir = tmpDir()
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
    try {
      git(['init', '-q'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'test'])
      fs.writeFileSync(path.join(dir, 'b.txt'), 'one')
      fs.writeFileSync(path.join(dir, 'a.txt'), 'one')
      git(['add', '.'])
      git(['commit', '-qm', 'init'])
      // Unstaged edits — git diff --name-only surfaces these.
      fs.writeFileSync(path.join(dir, 'b.txt'), 'two')
      fs.writeFileSync(path.join(dir, 'a.txt'), 'two')

      assert.deepEqual(await readChangedFiles(dir), ['a.txt', 'b.txt'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // audit L7: a staged-but-not-committed file must register too, not just unstaged diffs.
  test('reports a staged file', async () => {
    delete process.env.HAUS_DISABLE_GIT_SIGNALS
    const dir = tmpDir()
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
    try {
      git(['init', '-q'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'test'])
      fs.writeFileSync(path.join(dir, 'committed.txt'), 'v1')
      git(['add', 'committed.txt'])
      git(['commit', '-qm', 'init'])

      fs.writeFileSync(path.join(dir, 'staged.txt'), 'new')
      git(['add', 'staged.txt'])

      const files = await readChangedFiles(dir)
      assert.ok(files.includes('staged.txt'), `expected staged.txt in ${JSON.stringify(files)}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // audit L7: a brand-new, never-added file must register too.
  test('reports an untracked file', async () => {
    delete process.env.HAUS_DISABLE_GIT_SIGNALS
    const dir = tmpDir()
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
    try {
      git(['init', '-q'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'test'])
      fs.writeFileSync(path.join(dir, 'committed.txt'), 'v1')
      git(['add', 'committed.txt'])
      git(['commit', '-qm', 'init'])

      fs.writeFileSync(path.join(dir, 'untracked.txt'), 'new')

      const files = await readChangedFiles(dir)
      assert.ok(
        files.includes('untracked.txt'),
        `expected untracked.txt in ${JSON.stringify(files)}`,
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('deduplicates a file that is both staged and further modified unstaged', async () => {
    delete process.env.HAUS_DISABLE_GIT_SIGNALS
    const dir = tmpDir()
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
    try {
      git(['init', '-q'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'test'])
      fs.writeFileSync(path.join(dir, 'committed.txt'), 'v1')
      git(['add', 'committed.txt'])
      git(['commit', '-qm', 'init'])

      fs.writeFileSync(path.join(dir, 'committed.txt'), 'v2')
      git(['add', 'committed.txt'])
      fs.writeFileSync(path.join(dir, 'committed.txt'), 'v3')

      const files = await readChangedFiles(dir)
      const occurrences = files.filter((f) => f === 'committed.txt').length
      assert.equal(occurrences, 1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
