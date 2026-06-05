import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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

test('doctor prints a healthy verdict line after apply (WS6)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-verdict-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'verdict-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
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
  assert.match(r.stdout ?? '', /✅ Your project is set up and healthy\.|⚠️ \d+ thing/)
})

test('doctor flags a broken CLAUDE.md import target with a fix (WS6)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-bridge-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'bridge-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp })
  // Break the bridge: delete an @-imported target file.
  rmSync(path.join(temp, '.haus-workflow', 'workflow-config.md'))
  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(out, /workflow-config\.md/)
  assert.match(r.stdout ?? '', /⚠️ \d+ thing/)
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

// Regression: d562199 — verdict line must appear FIRST, before "Haus Doctor" and detail.
test('doctor verdict line appears before Haus Doctor header (d562199)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-order-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'order-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
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
  const stdout = r.stdout ?? ''
  const verdictIdx = stdout.search(/✅|⚠️/)
  const headerIdx = stdout.indexOf('Haus Doctor')
  assert.ok(verdictIdx >= 0, 'verdict line should be present')
  assert.ok(headerIdx >= 0, 'Haus Doctor header should be present')
  assert.ok(verdictIdx < headerIdx, 'verdict must appear before "Haus Doctor" header')
  rmSync(temp, { recursive: true, force: true })
})

// Regression: d562199 — doctor must detect a malformed import block (BEGIN without END).
test('doctor flags BEGIN-without-END import block as broken (d562199)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doctor-broken-block-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'broken-block', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp })
  // Write a CLAUDE.md that has a BEGIN marker but no END marker.
  const claudeMdPath = path.join(temp, 'CLAUDE.md')
  writeFileSync(
    claudeMdPath,
    '# My project\n\n<!-- HAUS:BEGIN haus-imports v=1 -->\n@.haus-workflow/WORKFLOW.md\n\n(END marker intentionally removed)\n',
  )
  const r = execaSync('node', [cli, 'doctor'], { cwd: temp, reject: false })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(out, /not closed|malformed|broken/i, 'doctor should flag broken import block')
  assert.match(
    r.stdout ?? '',
    /⚠️ \d+ thing/,
    'verdict should report at least 1 thing needing attention',
  )
  rmSync(temp, { recursive: true, force: true })
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
  assert.equal((r.stdout ?? '').includes('carries required haus hook contract'), true)
})
