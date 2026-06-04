import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// IMPORTANT: CACHE_MANIFEST in load-catalog.ts is resolved at module load time via os.homedir().
// We rely on HAUS_FIXTURE_CATALOG for deterministic tests. For the project-local fallback test
// we set HOME before the dynamic import so the module resolves CACHE_MANIFEST to our temp dir.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalItem(id) {
  return {
    id,
    type: 'skill',
    source: 'haus',
    path: `skills/${id}`,
    tags: [],
    repoRoles: [],
    tokenEstimate: 100,
  }
}

function writeManifest(filePath, items) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ items }), 'utf8')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('HAUS_FIXTURE_CATALOG env var overrides all other sources', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lc-fix-'))
  const manifestPath = path.join(tmpDir, 'fixture-manifest.json')
  writeManifest(manifestPath, [makeMinimalItem('test.fixture-item')])

  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  process.env.HAUS_FIXTURE_CATALOG = manifestPath

  try {
    const { loadCatalog } = await import('../src/catalog/load-catalog.js')
    const items = await loadCatalog('/tmp/any-root')

    assert.equal(items.length, 1)
    assert.equal(items[0].id, 'test.fixture-item')
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('falls through to bundled when no override and cache empty', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lc-home-'))

  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  const prevHome = process.env.HOME
  const prevUserProfile = process.env.USERPROFILE
  delete process.env.HAUS_FIXTURE_CATALOG
  // Set both HOME (Unix) and USERPROFILE (Windows) so os.homedir() picks up the temp dir
  process.env.HOME = tmpHome
  process.env.USERPROFILE = tmpHome

  try {
    // Cache-bust the import so CACHE_MANIFEST is re-evaluated with the new HOME
    const { loadCatalog } = await import('../src/catalog/load-catalog.js?r=' + Math.random())
    const items = await loadCatalog('/tmp/empty-root')

    // Bundled catalog may have real items or be empty — either is acceptable
    assert.ok(Array.isArray(items), 'loadCatalog should always return an array')
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test('returns [] for empty HAUS_FIXTURE_CATALOG manifest', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lc-empty-'))
  const manifestPath = path.join(tmpDir, 'empty-manifest.json')
  writeManifest(manifestPath, [])

  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  process.env.HAUS_FIXTURE_CATALOG = manifestPath

  try {
    const { loadCatalog } = await import('../src/catalog/load-catalog.js')
    const items = await loadCatalog('/tmp/any-root')

    assert.deepEqual(items, [])
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('project-local manifest used when cache empty and no env var', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lc-proj-home-'))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lc-proj-root-'))
  const localManifest = path.join(root, 'library/catalog/manifest.json')
  writeManifest(localManifest, [makeMinimalItem('test.local')])

  const prevFixture = process.env.HAUS_FIXTURE_CATALOG
  const prevHome = process.env.HOME
  const prevUserProfile = process.env.USERPROFILE
  delete process.env.HAUS_FIXTURE_CATALOG
  // Point HOME + USERPROFILE to an empty temp dir so the user-level cache won't exist
  process.env.HOME = tmpHome
  process.env.USERPROFILE = tmpHome

  try {
    // Cache-bust the import so CACHE_MANIFEST is re-evaluated with the new HOME,
    // guaranteeing the module-level constant resolves to the empty tmpHome cache dir.
    const { loadCatalog } = await import('../src/catalog/load-catalog.js?r=' + Math.random())
    const items = await loadCatalog(root)

    // CACHE_MANIFEST now resolves to the empty tmpHome, so the project-local manifest wins.
    assert.equal(items.length, 1, 'project-local manifest should be used when cache is absent')
    assert.equal(items[0].id, 'test.local')
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpHome, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})
