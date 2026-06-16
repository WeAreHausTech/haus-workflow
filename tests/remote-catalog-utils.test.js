import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'

import {
  fetchLatestCatalogTag,
  getCacheManifestAge,
  readWorkflowTemplate,
} from '../src/catalog/remote-catalog.js'

test('readWorkflowTemplate writes cache on non-dry run', async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-rc-utils-'))
  const prevCache = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  const prevFetch = globalThis.fetch
  process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = cacheDir
  process.env.HAUS_CATALOG_REMOTE_BASE = 'https://example.test'
  globalThis.fetch = async () => ({ ok: true, text: async () => '# workflow\n' })
  try {
    const text = await readWorkflowTemplate()
    assert.equal(text, '# workflow\n')
    const cached = path.join(cacheDir, 'templates', 'agentic-workflow-standard.md')
    assert.equal(existsSync(cached), true)
  } finally {
    globalThis.fetch = prevFetch
    if (prevCache === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
    else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCache
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})

test('getCacheManifestAge returns null when manifest missing', async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-rc-age-'))
  const prevCache = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = cacheDir
  try {
    const age = await getCacheManifestAge()
    assert.equal(age, null)
  } finally {
    if (prevCache === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
    else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCache
  }
})

test('getCacheManifestAge returns non-negative age when manifest exists', async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-rc-age-'))
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(path.join(cacheDir, 'manifest.json'), '{"items":[]}', 'utf8')
  const prevCache = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = cacheDir
  try {
    const age = await getCacheManifestAge()
    assert.equal(typeof age, 'number')
    assert.notEqual(age, null)
  } finally {
    if (prevCache === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
    else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCache
  }
})

test('fetchLatestCatalogTag returns null on non-OK response', async () => {
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  const prevFetch = globalThis.fetch
  delete process.env.HAUS_CATALOG_REMOTE_BASE
  globalThis.fetch = async () => ({ ok: false, json: async () => [] })
  try {
    const tag = await fetchLatestCatalogTag()
    assert.equal(tag, null)
  } finally {
    globalThis.fetch = prevFetch
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})
