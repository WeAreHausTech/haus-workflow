import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { execaSync } from 'execa'

const CLI = path.resolve('dist/cli.js')
const CATALOG = path.resolve('library/catalog/manifest.json')
const env = {
  ...process.env,
  HAUS_FIXTURE_CATALOG: CATALOG,
  HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(os.tmpdir(), `haus-deep-cache-${process.pid}`),
}

// Sets up a plain React repo (no Nx signal) and returns its temp root.
function reactRepo() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-deep-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'deep-test', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  return temp
}

function recommend(temp) {
  execaSync('node', [CLI, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: temp, env })
  return JSON.parse(readFileSync(path.join(temp, '.haus-workflow', 'recommendation.json'), 'utf8'))
}

const ids = (list) => new Set(list.map((x) => x.id))

test('deep-context.json roles make a role-gated skill eligible (pass 2)', () => {
  const temp = reactRepo()

  // Pass 1: no Nx signal → role-gated nx skills skipped via requiresAny.
  const pass1 = recommend(temp)
  assert.equal(ids(pass1.recommended).has('haus.nx-nx-workspace'), false)
  const nxSkip = pass1.skipped.find((x) => x.id === 'haus.nx-nx-workspace')
  assert.ok(nxSkip, 'haus.nx-nx-workspace should be skipped without nx-monorepo role')
  assert.equal(nxSkip.skipReasons[0]?.code, 'requires-any-unsatisfied')

  // The docs skill discovers an Nx workspace the shallow scanner missed.
  writeFileSync(
    path.join(temp, '.haus-workflow', 'deep-context.json'),
    JSON.stringify({ source: 'writing-documentation', roles: ['nx-monorepo'] }),
  )

  // Pass 2: enriched signal makes the skill eligible.
  const pass2 = recommend(temp)
  const nx = pass2.recommended.find((x) => x.id === 'haus.nx-nx-workspace')
  assert.ok(nx, 'Nx skill should be recommended after enrichment')
  assert.ok(
    nx.reasons.some((r) => (r.signal ?? '').startsWith('deep:role:')),
    'match should be tagged as a deep-discovered signal',
  )

  // Removing the enrichment reverts to the pass-1 result (determinism intact).
  rmSync(path.join(temp, '.haus-workflow', 'deep-context.json'))
  const pass3 = recommend(temp)
  assert.equal(ids(pass3.recommended).has('haus.nx-nx-workspace'), false)

  rmSync(temp, { recursive: true, force: true })
})

test('malformed deep-context.json is ignored, not thrown on', () => {
  const temp = reactRepo()
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  // LLM wrote the wrong shape: roles a string, stacks a string, patterns a number.
  writeFileSync(
    path.join(temp, '.haus-workflow', 'deep-context.json'),
    JSON.stringify({
      source: 'writing-documentation',
      roles: 'nx-monorepo',
      stacks: 'oops',
      patterns: 5,
    }),
  )
  // Must not throw; enrichment is simply ignored (headless path stays alive).
  const out = recommend(temp)
  assert.ok(Array.isArray(out.recommended), 'recommend should return normally')
  assert.equal(ids(out.recommended).has('haus.nx-nx-workspace'), false)
  rmSync(temp, { recursive: true, force: true })
})
