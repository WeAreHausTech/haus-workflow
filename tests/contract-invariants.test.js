import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// OFFLINE in-repo contract invariants (run by `yarn test`).
//
// The network-touching live-vs-committed drift check lives in
// scripts/contract-check.mjs and runs in CI (contract-drift.yml). This file is
// the offline counterpart: it asserts the committed test fixture stays
// internally consistent with the catalog-item contract WITHOUT a network call,
// so a fixture edit that breaks the contract fails fast in the normal suite.
//
// Key-set basis (NOT byte-equality): the fixture is an intentional curated
// subset (see its `_note`). We assert it uses only known catalog-item fields and
// valid enum values, and carries the fields the CLI's loader/recommender rely on.

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(repoRoot, rel), 'utf8'))
}

const fixture = readJson('tests/fixtures/catalog/manifest.json')

// Property set the catalog-item contract declares (mirrors src/types.ts
// CatalogItem and schema/catalog-item.schema.json). The live-vs-this drift is
// caught by scripts/contract-check.mjs; here we enforce the fixture against the
// bundled contract knowledge so the offline suite stays self-sufficient.
const KNOWN_ITEM_KEYS = new Set([
  'id',
  'type',
  'source',
  'version',
  'path',
  'title',
  'purpose',
  'whenToUse',
  'whenNotToUse',
  'tags',
  'repoRoles',
  'installMode',
  'references',
  'safetyNotes',
  'tokenBudget',
  'tokenEstimate',
  'default',
  'requiresAny',
  'ecosystem',
  'reviewStatus',
  'riskLevel',
  'useMode',
  'licenseConfidence',
  'license',
  'originSourceId',
  'originUrl',
  'pinnedRef',
  'intents',
  'sourceInfluences',
])

// Fields the CLI loader/recommender require on every item (a strict subset of
// the schema's required list; `version` is release-coupled and omitted from the
// fixture by design — see contract-check.mjs requiredOmitExempt).
const REQUIRED_FIXTURE_KEYS = ['id', 'type', 'source', 'path', 'tags', 'repoRoles', 'tokenEstimate']

const TYPE_ENUM = new Set(['skill', 'agent', 'template', 'rule', 'command'])
const SOURCE_ENUM = new Set(['haus', 'curated'])
const INSTALL_MODE_ENUM = new Set(['copy-selected', 'plugin-only'])

test('fixture manifest has the expected top-level shape', () => {
  assert.equal(typeof fixture.version, 'string', 'manifest.version must be a string')
  assert.ok(Array.isArray(fixture.items), 'manifest.items must be an array')
  assert.ok(fixture.items.length > 0, 'fixture must contain at least one item')
})

test('every fixture item uses only declared catalog-item fields', () => {
  const violations = []
  for (const item of fixture.items) {
    for (const key of Object.keys(item)) {
      if (!KNOWN_ITEM_KEYS.has(key)) violations.push(`${item.id ?? '?'}: unknown field "${key}"`)
    }
  }
  assert.deepEqual(violations, [], `fixture items use fields not in the catalog-item contract`)
})

test('every fixture item carries the CLI-required fields', () => {
  const violations = []
  for (const item of fixture.items) {
    for (const req of REQUIRED_FIXTURE_KEYS) {
      if (!(req in item)) violations.push(`${item.id ?? '?'}: missing required "${req}"`)
    }
  }
  assert.deepEqual(violations, [], 'fixture items missing CLI-required fields')
})

test('fixture item enum fields hold schema-valid values', () => {
  const violations = []
  for (const item of fixture.items) {
    if (!TYPE_ENUM.has(item.type)) violations.push(`${item.id}: type "${item.type}"`)
    if (!SOURCE_ENUM.has(item.source)) violations.push(`${item.id}: source "${item.source}"`)
    if (item.installMode !== undefined && !INSTALL_MODE_ENUM.has(item.installMode)) {
      violations.push(`${item.id}: installMode "${item.installMode}"`)
    }
    if (!Array.isArray(item.tags)) violations.push(`${item.id}: tags not an array`)
    if (!Array.isArray(item.repoRoles)) violations.push(`${item.id}: repoRoles not an array`)
    if (typeof item.tokenEstimate !== 'number') violations.push(`${item.id}: tokenEstimate not a number`)
  }
  assert.deepEqual(violations, [], 'fixture items have invalid enum/type values')
})

test('bundled haus-lock schema stub points at the canonical catalog schema', () => {
  // The committed library/catalog/haus-lock.schema.json is a $ref stub to the
  // catalog source of truth. Guard against it being hand-edited into a divergent
  // local copy (which would silently fork the lock-file contract).
  const stub = readJson('library/catalog/haus-lock.schema.json')
  assert.equal(
    stub.$ref,
    'https://raw.githubusercontent.com/WeAreHausTech/haus-workflow-catalog/main/schema/haus-lock.schema.json',
    'haus-lock schema stub must $ref the canonical catalog schema, not a local copy',
  )
})
