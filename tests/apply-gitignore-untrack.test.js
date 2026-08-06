import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { execaSync } from 'execa'

// Materialization plan Task 2: haus apply --write must (a) ensure .gitignore covers
// the machine-local scan artifacts, and (b) migrate a project that already has them
// tracked by `git rm --cached`-ing them, with a clear, non-silent explanation.
// See docs/decisions/0025-untrack-machine-local-scan-artifacts.md.

const cli = path.resolve('dist/cli.js')

function git(cwd, args) {
  return execaSync('git', args, { cwd })
}

function makeProject(prefix) {
  const temp = mkdtempSync(path.join(os.tmpdir(), `haus-${prefix}-`))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: prefix, packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  git(temp, ['init', '-q'])
  git(temp, ['config', 'user.email', 'test@example.com'])
  git(temp, ['config', 'user.name', 'test'])
  return temp
}

const env = { ...process.env, HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json') }

test('apply --write adds gitignore entries for a freshly-initialized project', (t) => {
  const temp = makeProject('gi-fresh')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env })

  const gitignore = readFileSync(path.join(temp, '.gitignore'), 'utf8')
  assert.match(gitignore, /\.haus-workflow\/context-map\.json/)
  assert.match(gitignore, /\.haus-workflow\/recommendation\.json/)
  assert.match(gitignore, /\.haus-workflow\/sources-report\.json/)
  assert.match(gitignore, /\.haus-workflow\/deep-context\.json/)
  assert.match(gitignore, /HAUS:BEGIN/)

  // Nothing should be tracked in a project that only ever ran through haus.
  const tracked = git(temp, [
    'ls-files',
    '--',
    '.haus-workflow/context-map.json',
    '.haus-workflow/recommendation.json',
    '.haus-workflow/sources-report.json',
  ]).stdout.trim()
  assert.equal(tracked, '')
})

test('apply --write untracks already-tracked artifacts and explains why', (t) => {
  const temp = makeProject('gi-migrate')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })

  // Simulate a project that (incorrectly) committed the scan artifact before this fix.
  assert.ok(existsSync(path.join(temp, '.haus-workflow/context-map.json')))
  git(temp, ['add', '.haus-workflow/context-map.json'])
  git(temp, ['commit', '-qm', 'poison: commit machine-local scan artifact'])

  const trackedBefore = git(temp, ['ls-files', '--', '.haus-workflow/context-map.json']).stdout.trim()
  assert.equal(trackedBefore, '.haus-workflow/context-map.json')

  const result = execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env })
  const out = (result.stdout ?? '') + (result.stderr ?? '')
  assert.match(out, /Untracked \.haus-workflow\/context-map\.json/)
  assert.match(out, /should never have been committed/)

  const trackedAfter = git(temp, ['ls-files', '--', '.haus-workflow/context-map.json']).stdout.trim()
  assert.equal(trackedAfter, '', 'context-map.json must no longer be tracked')

  // The untrack must not delete the file from disk — only from the git index.
  assert.ok(existsSync(path.join(temp, '.haus-workflow/context-map.json')), 'file remains on disk')
})

test('apply --write untracking is idempotent — a second run does not error', (t) => {
  const temp = makeProject('gi-idempotent')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  git(temp, ['add', '.haus-workflow/context-map.json'])
  git(temp, ['commit', '-qm', 'poison'])

  execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env })
  // Second run: nothing tracked anymore, must not throw/exit non-zero.
  const result = execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env, reject: false })
  assert.equal(result.exitCode, 0)
  const out = (result.stdout ?? '') + (result.stderr ?? '')
  assert.equal(out.includes('Untracked'), false, 'nothing left to untrack on the second run')
})
