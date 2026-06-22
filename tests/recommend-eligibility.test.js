/**
 * Unit tests for recommend() policy gates and eligibility signals.
 *
 * Strategy: use HAUS_FIXTURE_CATALOG to point at a minimal policy-gates fixture
 * (tests/fixtures/catalog/policy-gates-manifest.json) that has exactly one item
 * per gate. Each test exercises one gate in isolation.
 *
 * The tests do NOT invoke the CLI — they call recommend() from src/ directly via
 * tsx, so no build step is required.
 *
 * readChangedFiles() is called inside recommend(); we use a temp dir that is not
 * a git repo so it fails gracefully and returns [].
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { recommend } from '../src/recommender/recommend.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_MANIFEST = path.resolve('tests/fixtures/catalog/policy-gates-manifest.json')

/**
 * Build a minimal ContextMap. Override individual fields by merging in `overrides`.
 */
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

/** Return the ids present in an array of recommended/skipped items. */
const ids = (list) => new Set(list.map((x) => x.id))

/** Find the skip entry for a given id (or undefined). */
const findSkipped = (result, id) => result.skipped.find((x) => x.id === id)

/** Find the recommended entry for a given id (or undefined). */
const findRecommended = (result, id) => result.recommended.find((x) => x.id === id)

// ---------------------------------------------------------------------------
// Per-test setup / teardown
// ---------------------------------------------------------------------------

let tmpDir

function setup() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'haus-eligibility-'))
  mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
  process.env.HAUS_FIXTURE_CATALOG = FIXTURE_MANIFEST
}

function teardown() {
  delete process.env.HAUS_FIXTURE_CATALOG
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('UNSUPPORTED gate: python item skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.unsupported-python'),
      'python item should be in skipped',
    )
    const entry = findSkipped(result, 'test.unsupported-python')
    assert.equal(entry.skipReasons[0].code, 'unsupported-policy')
  } finally {
    teardown()
  }
})

test('config items: recommended on missing tooling signal, install:false, excluded from token stats', async () => {
  setup()
  try {
    const withoutSignal = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(withoutSignal.skipped).has('test.config-item'),
      'config item should be skipped when missing-eslint is absent',
    )
    const entry = findSkipped(withoutSignal, 'test.config-item')
    assert.equal(entry.skipReasons[0].code, 'requires-any-unsatisfied')

    const withSignal = await recommend(
      tmpDir,
      makeContext(tmpDir, { detectedStacks: { tooling: ['missing-eslint'] } }),
    )
    assert.ok(
      ids(withSignal.recommended).has('test.config-item'),
      'config item should be recommended when missing-eslint is present',
    )
    const recommended = findRecommended(withSignal, 'test.config-item')
    assert.equal(recommended.install, false)
    assert.equal(
      recommended.reasons.some((reason) => reason.code === 'config-scaffold'),
      true,
    )
    assert.equal(withSignal.selectedRules, 1, 'only default-baseline counts toward token stats')
    assert.equal(withSignal.estimatedContextTokens, 320)
  } finally {
    teardown()
  }
})

test('curated-not-approved gate: unapproved curated item skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.curated-not-approved'),
      'curated-not-approved item should be in skipped',
    )
    const entry = findSkipped(result, 'test.curated-not-approved')
    assert.equal(entry.skipReasons[0].code, 'curated-not-approved')
  } finally {
    teardown()
  }
})

test('deprecated gate: haus and curated deprecated items skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    for (const id of ['test.deprecated-haus', 'test.curated-deprecated']) {
      assert.ok(ids(result.skipped).has(id), `${id} should be in skipped`)
      const entry = findSkipped(result, id)
      assert.equal(entry.skipReasons[0].code, 'deprecated')
      assert.equal(entry.skipReasons[0].signal, 'reviewStatus:deprecated')
    }
    assert.equal(
      ids(result.recommended).has('test.deprecated-haus'),
      false,
      'deprecated default item must not be recommended',
    )
  } finally {
    teardown()
  }
})

test('curated-risk-blocked gate: blocked curated item skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.curated-risk-blocked'),
      'curated-risk-blocked item should be in skipped',
    )
    const entry = findSkipped(result, 'test.curated-risk-blocked')
    assert.equal(entry.skipReasons[0].code, 'curated-risk-blocked')
  } finally {
    teardown()
  }
})

test('sensitive-policy gate: item with secrets tag skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.env-management'),
      'secrets-tagged item should be in skipped',
    )
    const entry = findSkipped(result, 'test.env-management')
    assert.equal(entry.skipReasons[0].code, 'sensitive-policy')
  } finally {
    teardown()
  }
})

test('source-approval gate: third-party unapproved item skipped', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.third-party-unapproved'),
      'third-party item should be in skipped',
    )
    const entry = findSkipped(result, 'test.third-party-unapproved')
    assert.equal(entry.skipReasons[0].code, 'source-approval')
  } finally {
    teardown()
  }
})

test('required-role gate: nx21 skipped when nx-monorepo role absent', async () => {
  setup()
  try {
    // No nx-monorepo in repoRoles — hardcoded gate in recommend() fires.
    const result = await recommend(tmpDir, makeContext(tmpDir, { repoRoles: [] }))
    assert.ok(
      ids(result.skipped).has('haus.nx21-monorepo-patterns'),
      'nx21 item should be skipped when nx-monorepo role is absent',
    )
    const entry = findSkipped(result, 'haus.nx21-monorepo-patterns')
    assert.equal(entry.skipReasons[0].code, 'required-role-missing')
  } finally {
    teardown()
  }
})

test('requiresAny unsatisfied: svelte skill skipped when no svelte in context', async () => {
  setup()
  try {
    // Empty deps and stacks — svelte dependency clause is unsatisfied.
    const result = await recommend(
      tmpDir,
      makeContext(tmpDir, { dependencies: [], detectedStacks: {} }),
    )
    assert.ok(
      ids(result.skipped).has('test.requires-svelte'),
      'svelte item should be skipped when svelte not in context',
    )
    const entry = findSkipped(result, 'test.requires-svelte')
    assert.equal(entry.skipReasons[0].code, 'requires-any-unsatisfied')
  } finally {
    teardown()
  }
})

test('default baseline: always recommended regardless of context', async () => {
  setup()
  try {
    // No stacks, no roles, no deps — default:true item still makes it through.
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.recommended).has('test.default-baseline'),
      'default:true item should always be recommended',
    )
  } finally {
    teardown()
  }
})

test('tokenEstimate preserved through recommend pipeline (regression: 63e980c)', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    const item = findRecommended(result, 'test.default-baseline')
    assert.ok(item, 'test.default-baseline should be in recommended')
    assert.equal(item.tokenEstimate, 999, 'tokenEstimate must be preserved as-is from the catalog')
  } finally {
    teardown()
  }
})

test('deep-context schema drift: stacks as string coerced to [] not thrown (regression: 5b20c53)', async () => {
  setup()
  try {
    // Write a malformed deep-context.json — LLM wrote wrong shapes for all fields.
    writeFileSync(
      path.join(tmpDir, '.haus-workflow', 'deep-context.json'),
      JSON.stringify({
        source: 'writing-documentation',
        roles: 'nx-monorepo',
        stacks: 'oops',
        patterns: 5,
      }),
    )
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      Array.isArray(result.recommended),
      'recommend() should return normally despite malformed deep-context',
    )
  } finally {
    teardown()
  }
})

test('does not produce package-manager-match for npm4/npm89 pseudo-tags', async () => {
  setup()
  try {
    const manifestPath = path.join(tmpDir, 'npm4-fixture.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        items: [
          {
            id: 'test.npm4-tagged',
            type: 'skill',
            source: 'haus',
            version: '1.0.0',
            path: 'skills/npm4',
            title: 'Npm4 tagged default',
            tags: ['npm4'],
            repoRoles: [],
            tokenEstimate: 100,
            default: true,
          },
        ],
      }),
    )
    process.env.HAUS_FIXTURE_CATALOG = manifestPath
    const result = await recommend(tmpDir, makeContext(tmpDir, { packageManager: 'npm' }))
    const item = findRecommended(result, 'test.npm4-tagged')
    assert.ok(item, 'default item with npm4 tag should still be recommended')
    assert.equal(
      item.reasons?.some((reason) => reason.code === 'package-manager-match'),
      false,
      'npm4 tag must not produce package-manager-match when packageManager is npm',
    )
  } finally {
    teardown()
  }
})

test('requiresAny satisfied: role-matched item recommended when nextjs in stacks', async () => {
  setup()
  try {
    // detectedStacks includes nextjs — satisfies requiresAny [{ stack: 'nextjs' }].
    const result = await recommend(
      tmpDir,
      makeContext(tmpDir, { detectedStacks: { frontend: ['nextjs'] } }),
    )
    assert.ok(
      ids(result.recommended).has('test.role-matched'),
      'test.role-matched should be recommended when nextjs is in detectedStacks',
    )
  } finally {
    teardown()
  }
})
