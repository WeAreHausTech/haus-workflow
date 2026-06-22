/**
 * P5-1c: `haus apply --write --ids <list>` — non-interactive explicit selection
 * (the skill backend; no TTY checkbox). Installs exactly the listed recommended
 * ids, warns on ids absent from recommendation.json, and rejects combining with
 * --select.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execaSync } from 'execa'

const cli = path.resolve('dist/cli.js')
const env = {
  ...process.env,
  HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
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
  return temp
}

function lock(temp) {
  return JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
}

test('apply --ids installs exactly the listed recommended items', () => {
  const temp = makeProject('ids-basic')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  const rec = JSON.parse(
    readFileSync(path.join(temp, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  const installable = (rec.recommended ?? []).filter((r) => r.install !== false)
  assert.ok(installable.length > 0, 'fixture should yield at least one installable item')
  const chosen = installable[0].id

  execaSync('node', [cli, 'apply', '--write', '--ids', chosen], { cwd: temp, env })
  const ids = lock(temp).map((e) => e.id)
  assert.deepEqual(ids, [chosen], `expected only ${chosen}, got ${ids.join(', ')}`)
  assert.ok(existsSync(path.join(temp, '.claude/settings.json')), 'core files still written')
})

test('apply --ids warns and ignores ids not in recommendation.json', () => {
  const temp = makeProject('ids-unknown')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })

  const r = execaSync('node', [cli, 'apply', '--write', '--ids', 'haus.not-a-real-item'], {
    cwd: temp,
    env,
    reject: false,
  })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  assert.match(out, /not in recommendation\.json/)
  assert.equal(lock(temp).length, 0, 'unknown id installs nothing')
})

test('apply rejects combining --ids with --select', () => {
  const temp = makeProject('ids-conflict')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  const r = execaSync('node', [cli, 'apply', '--write', '--select', '--ids', 'x'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 1)
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  assert.match(out, /not both/)
})
