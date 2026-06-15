import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { execaSync } from 'execa'

// Point at the vendored fixture catalog so the recommender/apply has assets.
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

function makeFixture() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-setup-core-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'core-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  return temp
}

const ART = ['context-map.json', 'recommendation.json']

// The shared setup core (runSetupCore) is exercised through `setup-project`.
// This asserts the core writes the load-bearing artifact set parameterized on root.
test('setup core writes scan + recommendation artifacts', () => {
  const temp = makeFixture()
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'setup-project', '--json'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`)

  for (const f of ART) {
    assert.ok(existsSync(path.join(temp, '.haus-workflow', f)), `${f} not written by setup core`)
  }

  // Readerless artifacts pruned: setup core no longer emits these.
  for (const f of ['recommended-hooks.json', 'recommended-rules.json', 'dependency-map.json']) {
    assert.ok(!existsSync(path.join(temp, '.haus-workflow', f)), `${f} should no longer be written`)
  }
})

// In --json mode the core runs with apply:false → no Claude files written.
test('setup core in json/preview mode does not write .claude/ files', () => {
  const temp = makeFixture()
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'setup-project', '--json'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`)
  assert.ok(
    !existsSync(path.join(temp, '.claude/CLAUDE.md')),
    'preview mode must not write Claude files',
  )
})
