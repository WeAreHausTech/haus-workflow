#!/usr/bin/env node
/**
 * Cross-repo contract drift checker (network-touching).
 *
 * The catalog repo (WeAreHausTech/haus-workflow-catalog) is the source of truth
 * for `validation-rules.json`, `manifest.json`, and `schema/*.json`. This CLI
 * consumes SYNCED copies. Those copies drift silently when the catalog changes
 * and no sync PR lands. This script fetches the LIVE catalog artifacts and
 * compares them against the committed copies so drift surfaces in CI instead of
 * at a downstream user's install.
 *
 * Checkpoints (see ADR-0005):
 *  - BP#1: LIVE validation-rules.json vs committed library/catalog copy
 *          (byte/structure diff — these MUST be identical, see ADR-0001).
 *  - BP#2: LIVE manifest.json vs committed library/catalog/manifest.json
 *          (canonical diff — the bundled fallback catalog MUST match live).
 *  - BP#3: LIVE manifest.schema + catalog-item.schema vs the committed test
 *          fixture, on a KEY-SET basis. The fixture is an intentional curated
 *          subset, so this is NOT byte-equality — it fails only if the fixture
 *          uses a field the live schema removed, or omits a field the schema
 *          now requires.
 *  - BP#5: the haus.lock.json `catalogRef` shape vs the live haus-lock.schema.
 *
 * Strictness model:
 *  - On PR (default): drift => WARN, exit 0 (don't block feature work on an
 *    out-of-band catalog change; the sync PR is a separate flow).
 *  - On main push / scheduled cron, or CONTRACT_STRICT=1: drift => FAIL, exit 1.
 *  - Network failure: WARN + exit 0 (don't break CI on a transient blip),
 *    UNLESS CONTRACT_STRICT=1 (then a fetch failure is itself a hard failure).
 *
 * Catalog ref resolution:
 *  - HAUS_CATALOG_REF wins when set.
 *  - Else resolve latest release tag (`vX.Y.Z`) from GitHub tags.
 *  - Fallback to `main` only when no valid tag can be resolved.
 *
 * Uses Node global fetch (Node >=18). No new dependencies.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

let catalogRef = process.env.HAUS_CATALOG_REF
const REMOTE_BASE =
  process.env.HAUS_CATALOG_REMOTE_BASE ??
  'https://raw.githubusercontent.com/WeAreHausTech/haus-workflow-catalog'

// Strict when explicitly requested or when running on a non-PR trigger
// (main push / scheduled cron). PR runs are advisory.
const EVENT = process.env.GITHUB_EVENT_NAME ?? ''
const STRICT = process.env.CONTRACT_STRICT === '1' || EVENT === 'schedule' || EVENT === 'push'

const CATALOG_TAGS_API_URL = 'https://api.github.com/repos/WeAreHausTech/haus-workflow-catalog/tags'

const rawUrl = (path) => `${REMOTE_BASE}/${catalogRef ?? 'main'}/${path}`

let failed = false
const failures = []

function fail(msg) {
  failed = true
  failures.push(msg)
  console.error(`  ✗ ${msg}`)
}
function warn(msg) {
  console.warn(`  ⚠ ${msg}`)
}
function ok(msg) {
  console.log(`  ✓ ${msg}`)
}
function skip(msg) {
  console.log(`  ↷ SKIP: ${msg}`)
}

function readJson(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf8'))
}

/**
 * Tags an error as originating from reaching/parsing the LIVE catalog (vs a
 * local file/programmer error). Only NetworkError is tolerated in advisory mode;
 * everything else is a real failure that must surface.
 */
class NetworkError extends Error {}

function parseTagSemver(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

async function fetchLatestCatalogTag() {
  if (process.env.HAUS_CATALOG_REMOTE_BASE) return null
  try {
    const headers = { 'user-agent': 'haus-contract-check' }
    if (process.env.GITHUB_TOKEN) headers['authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    const res = await fetch(CATALOG_TAGS_API_URL, { headers })
    if (!res.ok) throw new NetworkError(`fetch ${CATALOG_TAGS_API_URL} -> HTTP ${res.status}`)
    const tags = await res.json()
    if (!Array.isArray(tags)) return null
    const valid = tags
      .map((entry) => {
        const name = typeof entry?.name === 'string' ? entry.name : ''
        const version = parseTagSemver(name)
        return version ? { name, version } : null
      })
      .filter(Boolean)
    if (valid.length === 0) return null
    valid.sort((a, b) => compareSemver(b.version, a.version))
    return valid[0].name
  } catch (err) {
    if (err instanceof NetworkError) throw err
    throw new NetworkError(
      `fetch/parse ${CATALOG_TAGS_API_URL} failed: ${err instanceof Error ? err.message : err}`,
    )
  }
}

async function resolveCatalogRef() {
  if (catalogRef) return catalogRef
  const latestTag = await fetchLatestCatalogTag()
  catalogRef = latestTag ?? 'main'
  return catalogRef
}

async function fetchJson(path) {
  const url = rawUrl(path)
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'haus-contract-check' } })
    if (!res.ok) throw new NetworkError(`fetch ${url} -> HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (err instanceof NetworkError) throw err
    throw new NetworkError(`fetch/parse ${url} failed: ${err instanceof Error ? err.message : err}`)
  }
}
async function fetchJsonOrNull(path) {
  // Returns null on 404 (resource absent in catalog) without throwing, so
  // callers can SKIP rather than treat "not present yet" as a network failure.
  const url = rawUrl(path)
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'haus-contract-check' } })
    if (res.status === 404) return null
    if (!res.ok) throw new NetworkError(`fetch ${url} -> HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (err instanceof NetworkError) throw err
    throw new NetworkError(`fetch/parse ${url} failed: ${err instanceof Error ? err.message : err}`)
  }
}

/** Collect the set of property names a JSON-schema object node declares. */
function schemaPropertyKeys(schema) {
  return new Set(Object.keys(schema?.properties ?? {}))
}

// ---------------------------------------------------------------------------
// BP#1b — decisions-triggers.json: committed copy must match the live catalog.
// ---------------------------------------------------------------------------
async function checkDecisionsTriggers() {
  console.log('BP#1b decisions-triggers.json (live vs committed):')
  const committedPath = resolve(repoRoot, 'library/catalog/decisions-triggers.json')
  if (!existsSync(committedPath)) {
    fail(`committed decisions-triggers.json not found at ${committedPath}`)
    return
  }
  const committed = readJson(committedPath)
  const live = await fetchJsonOrNull('decisions-triggers.json')
  if (!live) {
    skip('live catalog has no decisions-triggers.json yet')
    return
  }
  const a = JSON.stringify(canonical(committed))
  const b = JSON.stringify(canonical(live))
  if (a === b) {
    ok('committed decisions-triggers.json matches live catalog')
  } else {
    const diffs = topLevelKeyDiffs(committed, live)
    fail(
      `decisions-triggers.json DRIFT vs live catalog (ref ${catalogRef ?? 'main'}). ` +
        `Sync library/catalog/decisions-triggers.json from haus-workflow-catalog.` +
        (diffs.length ? ` Differing keys: ${diffs.join(', ')}` : ''),
    )
  }
}

// ---------------------------------------------------------------------------
// BP#1 — validation-rules.json: committed copy must match the live catalog.
// ---------------------------------------------------------------------------
async function checkValidationRules() {
  console.log('BP#1 validation-rules.json (live vs committed):')
  const committedPath = resolve(repoRoot, 'library/catalog/validation-rules.json')
  if (!existsSync(committedPath)) {
    fail(`committed validation-rules.json not found at ${committedPath}`)
    return
  }
  const committed = readJson(committedPath)
  const live = await fetchJson('validation-rules.json')

  // Compare canonicalised JSON (key order independent) — these two files are
  // meant to be identical (ADR-0001 single source of truth).
  const a = JSON.stringify(canonical(committed))
  const b = JSON.stringify(canonical(live))
  if (a === b) {
    ok('committed validation-rules.json matches live catalog')
  } else {
    // Report top-level keys that differ to make the sync PR obvious.
    const diffs = topLevelKeyDiffs(committed, live)
    fail(
      `validation-rules.json DRIFT vs live catalog (ref ${catalogRef ?? 'main'}). ` +
        `Run the catalog sync to refresh library/catalog/validation-rules.json.` +
        (diffs.length ? ` Differing keys: ${diffs.join(', ')}` : ''),
    )
  }
}

// ---------------------------------------------------------------------------
// BP#2 — manifest.json: bundled fallback copy must match the live catalog.
// The CLI ships library/catalog/manifest.json as the offline fallback used when
// the remote catalog can't be reached. If it lags the live manifest, an offline
// or locked-down install silently recommends/applies a stale item set. BP#1
// already catches validation-rules drift; this catches manifest drift the same
// way (canonical equality — the sync PR keeps them identical).
// ---------------------------------------------------------------------------
async function checkManifest() {
  console.log('BP#2 manifest.json (live vs committed):')
  const committedPath = resolve(repoRoot, 'library/catalog/manifest.json')
  if (!existsSync(committedPath)) {
    fail(`committed manifest.json not found at ${committedPath}`)
    return
  }
  const committed = readJson(committedPath)
  const live = await fetchJson('manifest.json')

  const a = JSON.stringify(canonical(committed))
  const b = JSON.stringify(canonical(live))
  if (a === b) {
    ok(`committed manifest.json matches live catalog (version ${live.version ?? '?'})`)
    return
  }
  const diffs = topLevelKeyDiffs(committed, live)
  const versionNote =
    committed.version !== live.version
      ? ` (committed version ${committed.version ?? '?'} vs live ${live.version ?? '?'})`
      : ''
  fail(
    `manifest.json DRIFT vs live catalog (ref ${catalogRef ?? 'main'})${versionNote}. ` +
      `Run the catalog sync to refresh library/catalog/manifest.json.` +
      (diffs.length ? ` Differing keys: ${diffs.join(', ')}` : ''),
  )
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    )
  }
  return value
}

function topLevelKeyDiffs(a, b) {
  const diffs = []
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (JSON.stringify(canonical(a[k])) !== JSON.stringify(canonical(b[k]))) diffs.push(k)
  }
  return diffs
}

// ---------------------------------------------------------------------------
// BP#3 — test fixture vs live schema, on a KEY-SET basis.
//   FAIL if the fixture uses a field the live schema removed.
//   FAIL if the fixture omits a field the live schema now REQUIRES.
// The fixture is an intentional curated subset; we never demand byte-equality.
// ---------------------------------------------------------------------------
async function checkFixtureAgainstSchema() {
  console.log('BP#3 test fixture vs live catalog-item schema (key-set):')
  const fixturePath = resolve(repoRoot, 'tests/fixtures/catalog/manifest.json')
  if (!existsSync(fixturePath)) {
    fail(`test fixture manifest not found at ${fixturePath}`)
    return
  }
  const fixture = readJson(fixturePath)
  const itemSchema = await fetchJson('schema/catalog-item.schema.json')
  const manifestSchema = await fetchJson('schema/manifest.schema.json')

  const allowedItemKeys = schemaPropertyKeys(itemSchema)
  const requiredItemKeys = new Set(itemSchema.required ?? [])
  const allowedManifestKeys = schemaPropertyKeys(manifestSchema)

  // Manifest-level: the fixture adds a `_note` documentation key which the live
  // schema (additionalProperties:false) does not declare. That is fixture-local
  // metadata, not a contract field, so we exempt it explicitly.
  const manifestExempt = new Set(['_note'])
  for (const key of Object.keys(fixture)) {
    if (manifestExempt.has(key)) continue
    if (!allowedManifestKeys.has(key)) {
      fail(`fixture manifest uses top-level key "${key}" not in live manifest schema`)
    }
  }

  const items = Array.isArray(fixture.items) ? fixture.items : []
  if (items.length === 0) {
    fail('fixture manifest has no items')
    return
  }

  // Fields the fixture deliberately omits even though the live schema marks them
  // required. The fixture is a curated subset frozen for deterministic CLI tests
  // (see its `_note`); `version` is release-coupled and irrelevant to the tests.
  // Adding to this set is a conscious decoupling decision — keep it tiny.
  const requiredOmitExempt = new Set(['version'])

  let removedFieldHits = 0
  let missingRequiredHits = 0
  for (const item of items) {
    const keys = Object.keys(item)
    // (a) fixture uses a field the live schema no longer declares.
    for (const k of keys) {
      if (!allowedItemKeys.has(k)) {
        fail(
          `fixture item "${item.id ?? '?'}" uses field "${k}" that the live ` +
            `catalog-item schema does not declare (field removed/renamed upstream).`,
        )
        removedFieldHits++
      }
    }
    // (b) fixture omits a field the live schema now requires.
    for (const req of requiredItemKeys) {
      if (requiredOmitExempt.has(req)) continue
      if (!keys.includes(req)) {
        fail(
          `fixture item "${item.id ?? '?'}" omits "${req}" which the live ` +
            `catalog-item schema now REQUIRES. Update the fixture.`,
        )
        missingRequiredHits++
      }
    }
  }
  if (removedFieldHits === 0 && missingRequiredHits === 0) {
    ok(
      `${items.length} fixture items use only declared fields and carry every ` +
        `non-exempt required field`,
    )
  }
}

// ---------------------------------------------------------------------------
// BP#5 — haus.lock.json `catalogRef` shape vs live haus-lock.schema.json.
//   Skip (logged) if the catalog has no such schema.
// ---------------------------------------------------------------------------
async function checkLockSchema() {
  console.log('BP#5 haus-lock catalogRef shape vs live haus-lock schema:')
  const lockSchema = await fetchJsonOrNull('schema/haus-lock.schema.json')
  if (lockSchema === null) {
    skip('no haus-lock.schema.json in live catalog — BP#5 not applicable')
    return
  }
  // The lock file is an array of row objects; catalogRef lives on each row.
  const rowSchema = lockSchema.items ?? lockSchema
  const props = rowSchema.properties ?? {}
  const catalogRef = props.catalogRef
  if (!catalogRef) {
    fail(
      'live haus-lock schema declares no `catalogRef` property — the CLI writes ' +
        'catalogRef into lock rows; schema and writer have drifted.',
    )
    return
  }
  if (catalogRef.type !== 'string') {
    fail(`live haus-lock schema: catalogRef type is "${catalogRef.type}", expected "string"`)
    return
  }
  // catalogRef must not be in the required set: the CLI omits it for legacy rows
  // and older installs; requiring it would break `haus update` on existing locks.
  const required = new Set(rowSchema.required ?? [])
  if (required.has('catalogRef')) {
    fail(
      'live haus-lock schema marks catalogRef REQUIRED, but the CLI treats it as ' +
        'optional (legacy lock rows omit it). Writer and schema have drifted.',
    )
    return
  }
  ok('catalogRef is an optional string in the live haus-lock schema (matches CLI writer)')
}

// ---------------------------------------------------------------------------
async function main() {
  try {
    const resolvedRef = await resolveCatalogRef()
    console.log(`contract-check: catalog ref "${resolvedRef}" (${STRICT ? 'STRICT' : 'advisory'})`)
    await checkValidationRules()
    await checkDecisionsTriggers()
    await checkManifest()
    await checkFixtureAgainstSchema()
    await checkLockSchema()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Only network/fetch errors are tolerated in advisory mode. A local error
    // (bad JSON in committed files, fs failure, programmer bug) is a real
    // breakage and must fail even on PR — never masked as "couldn't reach catalog".
    if (!(err instanceof NetworkError)) {
      console.error(`contract-check: local error (not a network issue): ${msg}`)
      process.exit(1)
    }
    if (STRICT) {
      console.error(`contract-check: network/fetch error under STRICT mode: ${msg}`)
      process.exit(1)
    }
    warn(
      `could not reach the live catalog (${msg}). Skipping contract check ` +
        `(network blip tolerated on non-strict runs).`,
    )
    process.exit(0)
  }

  if (failed) {
    if (STRICT) {
      console.error('\ncontract-check: FAIL (strict) — cross-repo drift detected:')
      for (const f of failures) console.error(`  - ${f}`)
      process.exit(1)
    }
    console.warn('\ncontract-check: drift detected (advisory on PR — will block on main/cron):')
    for (const f of failures) console.warn(`  - ${f}`)
    process.exit(0)
  }

  console.log('\ncontract-check: PASS — CLI is in sync with the live catalog.')
  process.exit(0)
}

main()
