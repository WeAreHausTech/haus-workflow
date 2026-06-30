import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveCatalogRef } from '../src/catalog/remote-catalog.js'

test('defaults to a release tag, not main, when HAUS_CATALOG_REF is unset', async () => {
  const ref = await resolveCatalogRef({
    env: {},
    fetchLatestTag: async () => 'v0.18.2',
  })
  assert.equal(ref, 'v0.18.2')
})

test('honors HAUS_CATALOG_REF override (pinning/testing)', async () => {
  const ref = await resolveCatalogRef({
    env: { HAUS_CATALOG_REF: 'v1.2.3' },
    fetchLatestTag: async () => 'v0.18.2',
  })
  assert.equal(ref, 'v1.2.3')
})

test('does NOT return main when tag resolution fails and a fallbackRef is provided', async () => {
  const ref = await resolveCatalogRef({
    env: {},
    fetchLatestTag: async () => null,
    fallbackRef: 'v3.1.0',
  })
  assert.equal(ref, 'v3.1.0')
  assert.notEqual(ref, 'main')
})

test('falls back to bundled snapshot ref when tag resolution fails and no fallbackRef given', async () => {
  // This test verifies that even without a fallbackRef, we do not silently serve 'main'
  // when there is a bundled snapshot. The bundled manifest is always present in the package,
  // so this should resolve to a version tag (e.g. "v3.2.0"), never 'main'.
  const ref = await resolveCatalogRef({
    env: {},
    fetchLatestTag: async () => null,
    // No fallbackRef: relies on getBundledCatalogRef() internally
  })
  // Must not be the unguarded 'main' fallback
  assert.notEqual(ref, 'main')
  // Must look like a version tag or known ref
  assert.match(ref, /^v\d+\.\d+\.\d+/)
})

test('serves main only when HAUS_CATALOG_REF=main is explicitly set in env', async () => {
  const ref = await resolveCatalogRef({
    env: { HAUS_CATALOG_REF: 'main' },
    fetchLatestTag: async () => 'v0.18.2',
  })
  assert.equal(ref, 'main')
})
