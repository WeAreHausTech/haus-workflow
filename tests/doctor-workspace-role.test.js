import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execaSync } from 'execa'

// Exempt these tests from `recommend`'s empty-cache check by pointing at the
// vendored fixture catalog. Child processes inherit this env.
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

// Task 3.5: a workspace/meta-repo root (repos.manifest.json present, no runnable
// stack of its own) should report `Roles: workspace` and must NOT emit the
// "Stack not recognised" noise that a genuine zero-signal single-repo project
// would legitimately get. See docs/plans/workspace-detection-and-permissions-fixes.md.

test('doctor at a workspace root reports Roles: workspace and suppresses "Stack not recognised"', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-workspace-'))
  writeFileSync(
    path.join(temp, 'repos.manifest.json'),
    JSON.stringify({
      repos: [
        { id: 'frontend', folder: 'frontend', repo: 'git@example.com:org/frontend.git' },
        { id: 'backend', folder: 'backend', repo: 'git@example.com:org/backend.git' },
      ],
    }),
  )

  const cli = path.resolve('dist/cli.js')
  const scanResult = execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  const scanned = JSON.parse(scanResult.stdout)
  assert.deepEqual(scanned.repoRoles, ['workspace'])
  assert.equal(scanned.detectionStatus, 'supported')

  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })

  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(out, /Roles: workspace/)
  assert.doesNotMatch(out, /Stack not recognised/)
  assert.doesNotMatch(out, /no supported framework detected/)

  rmSync(temp, { recursive: true, force: true })
})

test('regression: doctor at an ordinary zero-signal single-repo project still warns "Stack not recognised"', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-zero-signal-'))
  // No package.json, no composer.json, no workspace marker — a genuine
  // zero-signal repo, distinct from a workspace root.
  writeFileSync(path.join(temp, 'README.md'), '# just a readme\n')

  const cli = path.resolve('dist/cli.js')
  const scanResult = execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  const scanned = JSON.parse(scanResult.stdout)
  assert.deepEqual(scanned.repoRoles, [])
  assert.equal(scanned.detectionStatus, 'unknown')

  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })

  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(out, /Roles: unknown/)
  assert.match(out, /Stack not recognised/)

  rmSync(temp, { recursive: true, force: true })
})
