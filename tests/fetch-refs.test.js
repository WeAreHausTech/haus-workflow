import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs/promises'
import { mkdtempSync } from 'node:fs'
import http from 'node:http'

import { readCacheMeta, writeCacheMeta } from '../src/refs/cache-meta.js'

function startMockServer(handlers) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const handler = handlers[req.url ?? '/']
      if (handler) {
        const { status = 200, body = '', headers = {} } = handler
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
        res.end(body)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

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

test('urlToSlug converts URL to safe filename stem', async () => {
  const { urlToSlug } = await import('../src/refs/fetch-refs.js')
  assert.equal(urlToSlug('https://www.prisma.io/llms.txt'), 'www-prisma-io-llms-txt')
  assert.equal(urlToSlug('https://docs.bullmq.io/llms.txt'), 'docs-bullmq-io-llms-txt')
  assert.equal(urlToSlug('https://tanstack.com/llms.txt'), 'tanstack-com-llms-txt')
})

test('fetchSingleRef downloads content and stores etag', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { fetchSingleRef } = await import('../src/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { body: '# Prisma docs', headers: { etag: '"v1"' } },
  })
  t.after(() => stopServer(server))

  const url = `http://127.0.0.1:${port}/llms.txt`
  const meta = {}
  const result = await fetchSingleRef(url, dir, meta)

  assert.equal(result.result, 'fetched')
  assert.ok(meta[url])
  assert.equal(meta[url].etag, '"v1"')
  assert.ok(meta[url].file.endsWith('.md'))

  const written = await fs.readFile(path.join(dir, meta[url].file), 'utf8')
  assert.equal(written, '# Prisma docs')
})

test('fetchSingleRef returns unchanged on 304', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { fetchSingleRef } = await import('../src/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { status: 304, body: '' },
  })
  t.after(() => stopServer(server))

  const url = `http://127.0.0.1:${port}/llms.txt`
  const meta = {
    [url]: {
      url,
      etag: '"v1"',
      fetchedAt: '2026-06-24T00:00:00.000Z',
      file: 'existing.md',
    },
  }
  const result = await fetchSingleRef(url, dir, meta)
  assert.equal(result.result, 'unchanged')
})

test('fetchSingleRef returns failed on network error', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { fetchSingleRef } = await import('../src/refs/fetch-refs.js')

  const url = 'http://127.0.0.1:1/llms.txt' // nothing listening
  const meta = {}
  const result = await fetchSingleRef(url, dir, meta)
  assert.equal(result.result, 'failed')
})

test('fetchRefsForItems fetches llms.txt URLs only, skips local refs', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { fetchRefsForItems } = await import('../src/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { body: '# BullMQ docs', headers: { etag: '"bq1"' } },
  })
  t.after(() => stopServer(server))

  const items = [
    {
      id: 'haus.bullmq-patterns',
      references: [
        `http://127.0.0.1:${port}/llms.txt`,
        'references/local.md', // not an llms.txt URL — skip
      ],
    },
    { id: 'haus.no-refs' }, // no references field
  ]

  const summary = await fetchRefsForItems(items, dir)
  assert.equal(summary.fetched, 1)
  assert.equal(summary.unchanged, 0)
  assert.equal(summary.failed, 0)
})

test('fetchRefsForItems deduplicates URLs across items', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { fetchRefsForItems } = await import('../src/refs/fetch-refs.js')

  let fetchCount = 0
  const { server, port } = await startMockServer({
    '/llms.txt': {
      get body() {
        fetchCount++
        return '# Docs'
      },
    },
  })
  t.after(() => stopServer(server))

  const url = `http://127.0.0.1:${port}/llms.txt`
  const items = [
    { id: 'haus.a', references: [url] },
    { id: 'haus.b', references: [url] }, // same URL — should only fetch once
  ]

  const summary = await fetchRefsForItems(items, dir)
  assert.equal(summary.fetched, 1)
  assert.equal(fetchCount, 1)
})
