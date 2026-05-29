import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

// Exempt these tests from `apply`'s empty-cache check by pointing at the
// vendored fixture catalog. Child processes inherit this env.
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

test('doctor reports hooks OK after apply', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'doc-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  const cli = path.resolve('dist/cli.js')
  assert.doesNotThrow(() => execaSync('node', [cli, 'scan', '--json'], { cwd: temp }))
  assert.doesNotThrow(() => execaSync('node', [cli, 'recommend', '--json'], { cwd: temp }))
  assert.doesNotThrow(() => execaSync('node', [cli, 'apply', '--write'], { cwd: temp }))

  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').includes('HOOKS OK'), true)
})

test('doctor prints each shared warning once', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-dedupe-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  const dup = 'duplicate warning line for doctor'
  const context = {
    mode: 'fast',
    generatedAt: new Date().toISOString(),
    root: temp,
    repoName: 'dedupe',
    packageManager: 'yarn',
    repoRoles: [],
    confidence: 0.5,
    detectedStacks: {
      frontend: [],
      backend: [],
      databases: [],
      testing: [],
      auth: [],
      tooling: [],
      packageManagers: [],
    },
    dependencies: [],
    securityRisks: [],
    crossRepoHints: [],
    warnings: [dup],
  }
  writeFileSync(
    path.join(temp, '.haus-workflow/context-map.json'),
    JSON.stringify(context, null, 2),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/recommendation.json'),
    JSON.stringify(
      { mode: 'fast', recommended: [], skipped: [], warnings: [dup], estimatedContextTokens: 0 },
      null,
      2,
    ),
  )
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  const hits = (r.stdout ?? '').split(dup).length - 1
  assert.equal(hits, 1)
})

test('doctor reports CLI version line', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-cli-ver-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'cliver-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp })
  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  // warn() writes to stderr; check both streams since update-available uses warn().
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  // Should contain a CLI version line (up to date, update available, or check unavailable)
  assert.equal(out.includes('- CLI'), true)
})

test('doctor --hooks fails when settings missing', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-hooks-miss-'))
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, 'doctor', '--hooks'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 1)
  const out = `${r.stderr ?? ''}${r.stdout ?? ''}`
  assert.equal(out.includes('doctor --hooks') || out.includes('settings'), true)
})

test('doctor --hooks passes after apply', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-hooks-ok-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'dh-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp })
  const r = execaSync('node', [cli, 'doctor', '--hooks'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').includes('matches canonical hook contract'), true)
})
