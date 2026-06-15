import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'

import { repoNameFromUrl, runClone } from '../src/commands/clone.ts'

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

/** A source repo with one commit; its path is usable as a `git clone` url. */
function makeRemote(files = { 'README.md': '# hi\n' }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-clone-remote-'))
  git(['init'], dir)
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  git(['add', '-A'], dir)
  git(
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'init',
    ],
    dir,
  )
  return dir
}

function quiet(channel, fn) {
  const orig = console[channel]
  console[channel] = () => {}
  return Promise.resolve(fn()).finally(() => {
    console[channel] = orig
  })
}

test('repoNameFromUrl derives the folder name from https and ssh URLs', () => {
  assert.equal(repoNameFromUrl('https://github.com/WeAreHausTech/ecom-demo.git'), 'ecom-demo')
  assert.equal(repoNameFromUrl('git@github.com:WeAreHausTech/ecom-demo.git'), 'ecom-demo')
  assert.equal(repoNameFromUrl('https://github.com/acme/a/'), 'a')
})

test('runClone clones a repo into a given dir and is idempotent on re-run', async () => {
  const remote = makeRemote({ 'package.json': '{"name":"app"}' })
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-into-')), 'app')

  await quiet('log', () => runClone(remote, { dir: dest }))
  assert.ok(existsSync(path.join(dest, 'package.json')), 'repo cloned into the target dir')

  // Re-run is a no-op: a marker in the working tree survives.
  writeFileSync(path.join(dest, 'MARKER'), 'keep')
  await quiet('log', () => runClone(remote, { dir: dest }))
  assert.ok(existsSync(path.join(dest, 'MARKER')), 'existing dir left untouched on re-run')
})

test('runClone derives the target folder from the URL when no dir is given', async () => {
  const remote = makeRemote()
  // The derived folder is the remote basename; clone it under a fresh cwd.
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'haus-clone-cwd-'))
  const prev = process.cwd()
  process.chdir(cwd)
  try {
    await quiet('log', () => runClone(remote))
    assert.ok(
      existsSync(path.join(cwd, path.basename(remote))),
      'cloned into derived folder under cwd',
    )
  } finally {
    process.chdir(prev)
  }
})

// Regression: git exports GIT_DIR/GIT_WORK_TREE when running hooks (e.g. pre-push),
// and they are present when `haus clone` runs inside a repo. Inherited, they redirect
// `git clone` into the wrong location. runClone must scrub them for the subprocess.
test('runClone ignores ambient GIT_DIR / GIT_WORK_TREE and still clones correctly', async () => {
  const remote = makeRemote({ 'package.json': '{"name":"app"}' })
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-gitenv-')), 'app')
  const saved = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
    GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
  }
  process.env.GIT_DIR = path.join(remote, '.git')
  process.env.GIT_WORK_TREE = remote
  process.env.GIT_INDEX_FILE = path.join(remote, '.git', 'index')
  try {
    await quiet('log', () => runClone(remote, { dir: dest }))
    assert.ok(existsSync(path.join(dest, 'package.json')), 'cloned despite ambient GIT_* vars')
    assert.ok(existsSync(path.join(dest, '.git')), 'fresh .git created in the target dir')
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('runClone --dry-run clones nothing', async () => {
  const remote = makeRemote()
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-dry-')), 'app')
  await quiet('log', () => runClone(remote, { dir: dest, dryRun: true }))
  assert.ok(!existsSync(dest), 'dry run must not clone')
})

test('runClone errors on an empty url', async () => {
  const prev = process.exitCode
  process.exitCode = 0
  await quiet('error', () => runClone('  '))
  assert.equal(process.exitCode, 1, 'empty url sets non-zero exit')
  process.exitCode = prev
})

test('runClone reports a failed clone with a non-zero exit', async () => {
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-fail-')), 'nope')
  const prev = process.exitCode
  process.exitCode = 0
  await quiet('error', () => runClone('/no/such/repo/at/all.git', { dir: dest }))
  assert.equal(process.exitCode, 1, 'a failed clone sets non-zero exit')
  assert.ok(!existsSync(path.join(dest, '.git')), 'no repo left behind on failure')
  process.exitCode = prev
})
