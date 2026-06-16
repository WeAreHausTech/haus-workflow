import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchLatestCatalogTag } from '../src/catalog/remote-catalog.js'

test('fetchLatestCatalogTag returns highest semver tag, not first returned tag', async () => {
  const prevFetch = globalThis.fetch
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  delete process.env.HAUS_CATALOG_REMOTE_BASE
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [{ name: 'v1.2.0' }, { name: 'v1.10.0' }, { name: 'v1.9.9' }],
  })
  try {
    const tag = await fetchLatestCatalogTag()
    assert.equal(tag, 'v1.10.0')
  } finally {
    globalThis.fetch = prevFetch
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})

test('fetchLatestCatalogTag ignores non-semver tags and returns null when none valid', async () => {
  const prevFetch = globalThis.fetch
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  delete process.env.HAUS_CATALOG_REMOTE_BASE
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [{ name: 'latest' }, { name: 'nightly-123' }],
  })
  try {
    const tag = await fetchLatestCatalogTag()
    assert.equal(tag, null)
  } finally {
    globalThis.fetch = prevFetch
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})
