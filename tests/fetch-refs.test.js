import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs/promises'
import { mkdtempSync } from 'node:fs'

import { readCacheMeta, writeCacheMeta } from '../src/refs/cache-meta.js'

test('readCacheMeta returns empty object when file missing', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const meta = await readCacheMeta(dir)
  assert.deepEqual(meta, {})
})

test('writeCacheMeta + readCacheMeta round-trips', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const entry = {
    url: 'https://www.prisma.io/llms.txt',
    etag: '"abc123"',
    lastModified: undefined,
    fetchedAt: '2026-06-24T00:00:00.000Z',
    file: 'www-prisma-io-llms-txt.md',
  }
  const meta = { 'https://www.prisma.io/llms.txt': entry }
  await writeCacheMeta(dir, meta)
  const result = await readCacheMeta(dir)
  // JSON.stringify drops undefined values, so after round-trip the lastModified key is absent
  const expected = { 'https://www.prisma.io/llms.txt': {
    url: 'https://www.prisma.io/llms.txt',
    etag: '"abc123"',
    fetchedAt: '2026-06-24T00:00:00.000Z',
    file: 'www-prisma-io-llms-txt.md',
  } }
  assert.deepEqual(result, expected)
})
