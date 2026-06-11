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
    env: { HAUS_CATALOG_REF: 'main' },
    fetchLatestTag: async () => 'v0.18.2',
  })
  assert.equal(ref, 'main')
})

test('falls back to main only when no tag can be resolved', async () => {
  const ref = await resolveCatalogRef({ env: {}, fetchLatestTag: async () => null })
  assert.equal(ref, 'main')
})
