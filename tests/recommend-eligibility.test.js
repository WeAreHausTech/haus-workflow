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
    // selectedRules counts install:true items only (config items are excluded).
    // Fixture default-baseline + test.javascript-skill + test.mongodb-skill = 3.
    assert.equal(withSignal.selectedRules, 3, 'config items must not count toward selectedRules')
    assert.equal(withSignal.estimatedContextTokens, 960)
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

test('source-trust gate: third-party unapproved item skipped via live source trust', async () => {
  setup()
  try {
    // With A4 fix: trust is derived from live catalog items, not sources-report.json.
    // test.third-party-unapproved has no reviewStatus:approved → source is 'candidate'
    // in buildSourcesReport → hits the source-trust gate (not source-approval).
    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.third-party-unapproved'),
      'third-party item should be in skipped',
    )
    const entry = findSkipped(result, 'test.third-party-unapproved')
    assert.equal(entry.skipReasons[0].code, 'source-trust')
  } finally {
    teardown()
  }
})

test('required-role gate: turborepo-turborepo skipped when turbo-monorepo role absent', async () => {
  setup()
  try {
    // No turbo-monorepo in repoRoles — hardcoded gate in recommend() fires.
    const result = await recommend(tmpDir, makeContext(tmpDir, { repoRoles: [] }))
    assert.ok(
      ids(result.skipped).has('haus.turborepo-turborepo'),
      'turborepo item should be skipped when turbo-monorepo role is absent',
    )
    const entry = findSkipped(result, 'haus.turborepo-turborepo')
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

test('gates: every applicable gate is evaluated per item, not just the first failure', async () => {
  setup()
  try {
    // test.requires-svelte only fails the requiresAny gate — every other applicable
    // gate (former-id, invalid-source, unsupported-policy, deprecated, sensitive-policy,
    // source-trust, source-approval) must still show up as passed:true, not be omitted
    // because the loop used to stop at the first failure.
    const result = await recommend(
      tmpDir,
      makeContext(tmpDir, { dependencies: [], detectedStacks: {} }),
    )
    const entry = findSkipped(result, 'test.requires-svelte')
    assert.ok(Array.isArray(entry.gates), 'skipped entry should carry a gates array')
    const failing = entry.gates.filter((g) => !g.passed)
    assert.equal(failing.length, 1, 'exactly one gate should fail for a near-miss item')
    assert.equal(failing[0].name, 'requires-any-unsatisfied')
    assert.ok(
      entry.gates.some((g) => g.name === 'source-approval' && g.passed === true),
      'gates evaluated after the failing one must still be recorded as passed',
    )
  } finally {
    teardown()
  }
})

test('gates: an item failing multiple gates records all of them as failed', async () => {
  setup()
  try {
    // test.curated-deprecated fails 'deprecated', 'curated-not-approved', and (since no
    // curated fixture item is approved+unblocked) the catalog-wide 'curated' source trust
    // never reaches 'approved' either, so 'source-trust'/'source-approval' fail too — all
    // now visible since the loop no longer stops at the first failure. The legacy
    // first-failure skipReasons must still report 'deprecated' (order-preserving backward
    // compat), but the gates array must show every one of them as failed.
    const result = await recommend(tmpDir, makeContext(tmpDir))
    const entry = findSkipped(result, 'test.curated-deprecated')
    assert.equal(entry.skipReasons[0].code, 'deprecated', 'legacy first-failure code unchanged')
    const failingNames = entry.gates.filter((g) => !g.passed).map((g) => g.name)
    assert.deepEqual(
      failingNames.sort(),
      ['curated-not-approved', 'deprecated', 'source-approval', 'source-trust'],
      'every failing gate should be recorded, not just the first',
    )
  } finally {
    teardown()
  }
})

test('gates: a recommended item carries an all-passed gates array', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    const entry = findRecommended(result, 'test.default-baseline')
    assert.ok(Array.isArray(entry.gates))
    assert.ok(entry.gates.length > 0)
    assert.ok(entry.gates.every((g) => g.passed === true))
  } finally {
    teardown()
  }
})

test("gates: co-install suppression preserves the removed item's gate breakdown", async () => {
  setup()
  try {
    // Both haus.ecc-e2e-testing and haus.ecc-e2e-runner become eligible together (same
    // requiresAny stack tag), then applyCoInstallSuppression() moves the runner from
    // recommended into skipped. Its gates array (all-passed, since it was never blocked
    // by a named gate) must survive that move, not be dropped.
    const result = await recommend(
      tmpDir,
      makeContext(tmpDir, { detectedStacks: { tooling: ['co-install-test-e2e'] } }),
    )
    assert.ok(ids(result.recommended).has('haus.ecc-e2e-testing'))
    const entry = findSkipped(result, 'haus.ecc-e2e-runner')
    assert.ok(entry, 'ecc-e2e-runner should be suppressed into skipped')
    assert.equal(entry.skipReasons[0].code, 'co-install-e2e-skill')
    assert.ok(Array.isArray(entry.gates), 'suppressed entry must keep its gates breakdown')
    assert.ok(entry.gates.length > 0)
    assert.ok(
      entry.gates.every((g) => g.passed === true),
      'it passed every named gate',
    )
  } finally {
    teardown()
  }
})

test('gates: manual --include preserves the previously-skipped gate breakdown', async () => {
  setup()
  try {
    // test.requires-svelte fails only requires-any-unsatisfied. Force-include it, then
    // confirm the promoted recommended entry still carries that gate breakdown instead
    // of losing it in the skipped -> recommended splice.
    const result = await recommend(
      tmpDir,
      makeContext(tmpDir, { dependencies: [], detectedStacks: {} }),
      { include: ['test.requires-svelte'] },
    )
    const entry = findRecommended(result, 'test.requires-svelte')
    assert.ok(entry, 'manually included item should be recommended')
    assert.equal(entry.selectionMode, 'manual')
    assert.ok(Array.isArray(entry.gates), 'promoted entry must keep its gates breakdown')
    const failing = entry.gates.filter((g) => !g.passed)
    assert.deepEqual(
      failing.map((g) => g.name),
      ['requires-any-unsatisfied'],
      'the gate that was force-overridden should still show as failed',
    )
  } finally {
    teardown()
  }
})

test('former ids are never recommended while their current item remains eligible', async () => {
  setup()
  try {
    const manifestPath = path.join(tmpDir, 'former-ids-fixture.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        items: [
          {
            id: 'test.renamed-current',
            formerIds: ['test.renamed-old'],
            type: 'skill',
            source: 'haus',
            version: '2.0.0',
            path: 'skills/renamed-current',
            title: 'Renamed current item',
            tags: ['workflow'],
            repoRoles: [],
            tokenEstimate: 100,
            default: true,
          },
          {
            id: 'test.renamed-old',
            type: 'skill',
            source: 'haus',
            version: '1.0.0',
            path: 'skills/renamed-old',
            title: 'Stale former-id item',
            tags: ['workflow'],
            repoRoles: [],
            tokenEstimate: 100,
            default: true,
          },
        ],
      }),
    )
    process.env.HAUS_FIXTURE_CATALOG = manifestPath

    const result = await recommend(tmpDir, makeContext(tmpDir), {
      include: ['test.renamed-old'],
    })

    assert.ok(ids(result.recommended).has('test.renamed-current'))
    assert.equal(ids(result.recommended).has('test.renamed-old'), false)
    assert.equal(findSkipped(result, 'test.renamed-old')?.skipReasons[0]?.code, 'former-id')
    assert.ok(
      result.warnings.includes(
        '--include: "test.renamed-old" cannot be force-installed (blocked by former-id)',
      ),
    )
  } finally {
    teardown()
  }
})

test('malformed formerIds are ignored (treated as none)', async () => {
  setup()
  try {
    const manifestPath = path.join(tmpDir, 'malformed-former-ids-fixture.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        items: [
          {
            id: 'test.malformed-former',
            formerIds: 'not-an-array',
            type: 'skill',
            source: 'haus',
            version: '1.0.0',
            path: 'skills/malformed-former',
            title: 'Malformed formerIds item',
            tags: ['workflow'],
            repoRoles: [],
            tokenEstimate: 100,
            default: true,
          },
          {
            id: 'n',
            type: 'skill',
            source: 'haus',
            version: '1.0.0',
            path: 'skills/n',
            title: 'Single-char id must not be skipped',
            tags: ['workflow'],
            repoRoles: [],
            tokenEstimate: 100,
            default: true,
          },
        ],
      }),
    )
    process.env.HAUS_FIXTURE_CATALOG = manifestPath

    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(ids(result.recommended).has('test.malformed-former'))
    assert.ok(
      ids(result.recommended).has('n'),
      'string formerIds must not iterate per-character into skip set',
    )
    assert.equal(findSkipped(result, 'n'), undefined)
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

// ---------------------------------------------------------------------------
// A3 regression: exact-tag matching for FORBIDDEN_TAGS gates
// ---------------------------------------------------------------------------

test('A3 regression: javascript-tagged item NOT dropped by java forbidden gate', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    // 'javascript' contains 'java' as a substring — the old substring check would
    // incorrectly drop this item. The fix uses exact tag-array membership.
    assert.ok(
      !ids(result.skipped).has('test.javascript-skill'),
      'javascript-tagged item must NOT be skipped by the java forbidden gate',
    )
    assert.ok(
      ids(result.recommended).has('test.javascript-skill'),
      'javascript-tagged default item must be recommended',
    )
  } finally {
    teardown()
  }
})

test('A3 regression: mongodb-tagged item NOT dropped by go forbidden gate', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    // 'mongodb' contains 'go' as a substring — the old substring check would
    // incorrectly drop this item. The fix uses exact tag-array membership.
    assert.ok(
      !ids(result.skipped).has('test.mongodb-skill'),
      'mongodb-tagged item must NOT be skipped by the go forbidden gate',
    )
    assert.ok(
      ids(result.recommended).has('test.mongodb-skill'),
      'mongodb-tagged default item must be recommended',
    )
  } finally {
    teardown()
  }
})

test('A3 regression: exact java tag IS still dropped by the forbidden gate', async () => {
  setup()
  try {
    const result = await recommend(tmpDir, makeContext(tmpDir))
    // An item whose tags contain exactly 'java' must still be blocked.
    assert.ok(
      ids(result.skipped).has('test.java-skill'),
      'java-tagged item must be blocked by the forbidden gate',
    )
    const entry = findSkipped(result, 'test.java-skill')
    assert.equal(entry.skipReasons[0].code, 'unsupported-policy')
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

// ---------------------------------------------------------------------------
// A4 regression: source trust from live reviewStatus, not stale file
// ---------------------------------------------------------------------------

test('A4 regression: live-rejected item blocked even with stale approved sources-report on disk', async () => {
  setup()
  try {
    // Write a stale sources-report.json that claims external-plugin is 'approved'.
    // Before the fix, this stale file would allow test.live-rejected-source through.
    // After the fix, trust is derived from live catalog items, so the candidate
    // reviewStatus on the item itself causes source-trust to be 'candidate' → blocked.
    writeFileSync(
      path.join(tmpDir, '.haus-workflow', 'sources-report.json'),
      JSON.stringify({
        generatedAt: '2024-01-01T00:00:00.000Z',
        items: [{ source: 'external-plugin', status: 'approved' }],
      }),
    )

    const result = await recommend(tmpDir, makeContext(tmpDir))
    assert.ok(
      ids(result.skipped).has('test.live-rejected-source'),
      'item from non-approved live source must be skipped even when stale file claims approved',
    )
    const entry = findSkipped(result, 'test.live-rejected-source')
    assert.ok(
      entry.skipReasons[0].code === 'source-trust' ||
        entry.skipReasons[0].code === 'source-approval',
      `expected source-trust or source-approval skip code, got: ${entry.skipReasons[0].code}`,
    )
  } finally {
    teardown()
  }
})
