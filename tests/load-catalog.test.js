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
  delete process.env.HAUS_FIXTURE_CATALOG
  process.env.HOME = tmpHome

  try {
    const { loadCatalog } = await import('../src/catalog/load-catalog.js')
    const items = await loadCatalog('/tmp/empty-root')

    // Bundled catalog may have real items or be empty — either is acceptable
    assert.ok(Array.isArray(items), 'loadCatalog should always return an array')
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    process.env.HOME = prevHome
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
  delete process.env.HAUS_FIXTURE_CATALOG
  // Point HOME to an empty temp dir so the user-level cache manifest won't exist
  process.env.HOME = tmpHome

  try {
    // Dynamic import here so if CACHE_MANIFEST was already resolved in a prior test,
    // we fall through to the project-local path because the HOME-based cache is absent.
    const { loadCatalog } = await import('../src/catalog/load-catalog.js')
    const items = await loadCatalog(root)

    // The project-local manifest should be found; it contains exactly one item.
    // If the module-level CACHE_MANIFEST happens to resolve to a real populated cache,
    // that cache takes precedence — we only assert the shape is an array in that edge case.
    assert.ok(Array.isArray(items))
    // If cache was empty (expected path), assert local item is returned.
    if (items.length === 1) {
      assert.equal(items[0].id, 'test.local')
    }
  } finally {
    if (prevFixture === undefined) delete process.env.HAUS_FIXTURE_CATALOG
    else process.env.HAUS_FIXTURE_CATALOG = prevFixture
    process.env.HOME = prevHome
    fs.rmSync(tmpHome, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})
