import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { execaSync } from 'execa'

const CLI = path.resolve('dist/cli.js')

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
  execaSync('node', [CLI, 'scan', '--json'], { cwd: temp })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: temp })
  return JSON.parse(readFileSync(path.join(temp, '.haus-workflow', 'recommendation.json'), 'utf8'))
}

const ids = (list) => new Set(list.map((x) => x.id))

test('deep-context.json roles make a role-gated skill eligible (pass 2)', () => {
  const temp = reactRepo()

  // Pass 1: no Nx signal → the Nx-gated skill is skipped.
  const pass1 = recommend(temp)
  assert.equal(ids(pass1.recommended).has('haus.nx21-monorepo-patterns'), false)
  assert.equal(ids(pass1.skipped).has('haus.nx21-monorepo-patterns'), true)

  // The docs skill discovers an Nx workspace the shallow scanner missed.
  writeFileSync(
    path.join(temp, '.haus-workflow', 'deep-context.json'),
    JSON.stringify({ source: 'writing-documentation', roles: ['nx-monorepo'] }),
  )

  // Pass 2: enriched signal makes the skill eligible.
  const pass2 = recommend(temp)
  const nx = pass2.recommended.find((x) => x.id === 'haus.nx21-monorepo-patterns')
  assert.ok(nx, 'Nx skill should be recommended after enrichment')
  assert.ok(
    nx.reasons.some((r) => (r.signal ?? '').startsWith('deep:role:')),
    'match should be tagged as a deep-discovered signal',
  )

  // Removing the enrichment reverts to the pass-1 result (determinism intact).
  rmSync(path.join(temp, '.haus-workflow', 'deep-context.json'))
  const pass3 = recommend(temp)
  assert.equal(ids(pass3.recommended).has('haus.nx21-monorepo-patterns'), false)

  rmSync(temp, { recursive: true, force: true })
})
