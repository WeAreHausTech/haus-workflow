import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'

import { normalizeGitUrl, repoNameFromUrl, runClone } from '../src/commands/clone.ts'

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

/** Runs `fn`, capturing everything written to console.log/warn/error, and returns it. */
async function capture(fn) {
  const lines = []
  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error
  console.log = (...args) => lines.push(args.join(' '))
  console.warn = (...args) => lines.push(args.join(' '))
  console.error = (...args) => lines.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.log = origLog
    console.warn = origWarn
    console.error = origError
  }
  return lines.join('\n')
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

test('normalizeGitUrl treats ssh and https forms of the same repo as equal', () => {
  assert.equal(
    normalizeGitUrl('git@github.com:WeAreHausTech/ecom-demo.git'),
    normalizeGitUrl('https://github.com/WeAreHausTech/ecom-demo'),
  )
  assert.notEqual(
    normalizeGitUrl('https://github.com/WeAreHausTech/ecom-demo'),
    normalizeGitUrl('https://github.com/WeAreHausTech/other-repo'),
  )
})

// Regression: a trailing slash after ".git" (a common copy-paste shape) must not
// survive as a literal ".git" once the slash is stripped — order of operations
// matters here (strip the slash before checking for ".git", not after).
test('normalizeGitUrl treats a trailing slash after .git the same as no .git at all', () => {
  assert.equal(
    normalizeGitUrl('https://github.com/WeAreHausTech/ecom-demo.git/'),
    normalizeGitUrl('https://github.com/WeAreHausTech/ecom-demo'),
  )
})

// The test suite's own makeRemote() helper clones from a bare local filesystem
// path (no scheme, no host) rather than a real URL — confirm that shape still
// compares equal to itself and unequal to a different path.
test('normalizeGitUrl compares bare local filesystem paths (used in this test file)', () => {
  assert.equal(normalizeGitUrl('/tmp/haus-clone-remote-abc123'), normalizeGitUrl('/tmp/haus-clone-remote-abc123'))
  assert.notEqual(normalizeGitUrl('/tmp/haus-clone-remote-abc123'), normalizeGitUrl('/tmp/haus-clone-remote-xyz789'))
})

// Regression (fr-3): an existing target dir must not be treated as "already cloned"
// on name alone — only a git repo whose origin actually matches the requested URL.
test('runClone reports a clear match (not just existence) when re-run against the same repo', async () => {
  const remote = makeRemote()
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-match-')), 'app')
  await quiet('log', () => runClone(remote, { dir: dest }))

  const output = await capture(() => runClone(remote, { dir: dest }))
  assert.match(output, /already cloned here, matches/)
  assert.ok(existsSync(path.join(dest, '.git')), 'clone left in place')
})

test('runClone refuses a target that is a different git repo, non-zero exit', async () => {
  const remoteA = makeRemote({ 'a.txt': 'a' })
  const remoteB = makeRemote({ 'b.txt': 'b' })
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-conflict-')), 'app')
  await quiet('log', () => runClone(remoteA, { dir: dest }))

  const prev = process.exitCode
  process.exitCode = 0
  const output = await capture(() => runClone(remoteB, { dir: dest }))
  assert.equal(process.exitCode, 1, 'a mismatched existing repo sets non-zero exit')
  assert.match(output, /already exists as a different repository/)
  assert.ok(existsSync(path.join(dest, 'a.txt')), 'original clone is left untouched, not overwritten')
  process.exitCode = prev
})

test('runClone refuses a target that exists but is not a git repository, non-zero exit', async () => {
  const remote = makeRemote()
  const parent = mkdtempSync(path.join(os.tmpdir(), 'haus-clone-notgit-'))
  const dest = path.join(parent, 'app')
  mkdirSync(dest)
  writeFileSync(path.join(dest, 'unrelated.txt'), 'hi')

  const prev = process.exitCode
  process.exitCode = 0
  const output = await capture(() => runClone(remote, { dir: dest }))
  assert.equal(process.exitCode, 1, 'a non-git existing dir sets non-zero exit')
  assert.match(output, /already exists and is not a git repository/)
  assert.ok(existsSync(path.join(dest, 'unrelated.txt')), 'unrelated dir left untouched')
  process.exitCode = prev
})

test('runClone --dry-run against a name conflict reports it without failing the dry run', async () => {
  const remoteA = makeRemote({ 'a.txt': 'a' })
  const remoteB = makeRemote({ 'b.txt': 'b' })
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-conflict-dry-')), 'app')
  await quiet('log', () => runClone(remoteA, { dir: dest }))

  const prev = process.exitCode
  process.exitCode = 0
  const output = await capture(() => runClone(remoteB, { dir: dest, dryRun: true }))
  // Matches this codebase's dry-run convention (apply.ts): dry-run reports a real
  // problem but does not fail the run — only a real (non-dry-run) attempt does.
  assert.equal(process.exitCode, 0, 'dry-run must not set a non-zero exit, even on a real conflict')
  assert.match(output, /already exists as a different repository/)
  assert.ok(existsSync(path.join(dest, 'a.txt')), 'original clone untouched by dry-run conflict check')
  process.exitCode = prev
})

test('runClone --dry-run against an already-matching clone is a silent no-op', async () => {
  const remote = makeRemote()
  const dest = path.join(mkdtempSync(path.join(os.tmpdir(), 'haus-clone-match-dry-')), 'app')
  await quiet('log', () => runClone(remote, { dir: dest }))

  const output = await capture(() => runClone(remote, { dir: dest, dryRun: true }))
  assert.match(output, /already cloned here, matches/)
  assert.ok(existsSync(path.join(dest, '.git')), 'clone left in place')
})
