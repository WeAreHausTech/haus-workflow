// tests/git-signal.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { readChangedFiles } from '../src/recommender/git-signal.js'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haus-gitsig-'))
}

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
