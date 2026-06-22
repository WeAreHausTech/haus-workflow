/**
 * P5-1 opt-in primitives: recommend() emits optInEligible[] for role-gated tier
 * items whose gate is unsatisfied, and --include promotes items to manual
 * selections (honoring hard policy blocks).
 *
 * Calls recommend() directly via tsx against a minimal fixture (no build step).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { recommend } from '../src/recommender/recommend.js'

const FIXTURE = path.resolve('tests/fixtures/catalog/opt-in-manifest.json')

function makeContext(root, overrides = {}) {
  return {
    mode: 'guided',
    generatedAt: new Date().toISOString(),
    root,
    repoName: 'test-repo',
    packageManager: 'yarn',
    repoRoles: [],
    detectedStacks: {},
    dependencies: [],
    securityRisks: [],
    crossRepoHints: [],
    warnings: [],
    detectionStatus: 'supported',
    unsupportedSignals: [],
    ...overrides,
  }
}

let tmpDir
function setup() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'haus-opt-in-'))
  mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
  process.env.HAUS_FIXTURE_CATALOG = FIXTURE
}
function teardown() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.HAUS_FIXTURE_CATALOG
}

const find = (list, id) => list.find((x) => x.id === id)

test('optInEligible lists role-gated tier items when their role is absent', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    const ids = (result.optInEligible ?? []).map((e) => e.id)
    assert.ok(ids.includes('test.opt-in-code-review'), 'code-review opt-in should be eligible')
    assert.ok(ids.includes('test.opt-in-redis-ops'), 'redis-ops opt-in should be eligible')

    const entry = find(result.optInEligible, 'test.opt-in-code-review')
    assert.equal(entry.optInTier, 'workflow')
    assert.equal(entry.optInGroup, 'Code review workflow')
    assert.equal(entry.tokenEstimate, 700)
    assert.match(entry.requires, /code-review/)

    // Deprecated item is hard-blocked, never offered as opt-in.
    assert.ok(!ids.includes('test.deprecated'), 'deprecated item must not be eligible')
  } finally {
    teardown()
  }
})

test('optInEligible omits items whose role is already satisfied (they install instead)', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir, { repoRoles: ['code-review'] }))
    const optInIds = (result.optInEligible ?? []).map((e) => e.id)
    assert.ok(!optInIds.includes('test.opt-in-code-review'))
    assert.ok(find(result.recommended, 'test.opt-in-code-review'), 'should be recommended via role')
  } finally {
    teardown()
  }
})

test('--include promotes a gated item to a manual selection and removes it from skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir), {
      include: ['test.opt-in-code-review'],
    })
    const rec = find(result.recommended, 'test.opt-in-code-review')
    assert.ok(rec, 'included item should be recommended')
    assert.equal(rec.selectionMode, 'manual')
    assert.ok(!find(result.skipped, 'test.opt-in-code-review'), 'no longer skipped')
    // No longer offered as opt-in once included.
    assert.ok(!(result.optInEligible ?? []).some((e) => e.id === 'test.opt-in-code-review'))
    assert.ok(
      result.warnings.some((w) => w.includes('requiresAny gate is unsatisfied')),
      'should warn that the gate is unsatisfied',
    )
  } finally {
    teardown()
  }
})

test('--include refuses to force-install a hard-blocked (deprecated) item', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir), { include: ['test.deprecated'] })
    assert.ok(!find(result.recommended, 'test.deprecated'), 'deprecated must not be promoted')
    assert.ok(
      result.warnings.some((w) => w.includes('test.deprecated') && w.includes('deprecated')),
      'should warn the item is blocked',
    )
  } finally {
    teardown()
  }
})

test('--include warns on an unknown catalog id', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir), {
      include: ['test.does-not-exist'],
    })
    assert.ok(result.warnings.some((w) => w.includes('unknown catalog id')))
  } finally {
    teardown()
  }
})
