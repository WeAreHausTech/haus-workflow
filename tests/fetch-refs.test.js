import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs/promises'
import { mkdtempSync } from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

import { execa } from 'execa'

import { readCacheMeta, writeCacheMeta } from '../src/refs/cache-meta.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_CLI = path.resolve(__dirname, '../dist/cli.js')

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

test('collectLlmsTxtUrls dedupes and filters non-llms.txt refs', async () => {
  const { collectLlmsTxtUrls } = await import('../src/refs/fetch-refs.js')
  const items = [
    { id: 'a', references: ['https://x.dev/llms.txt', 'references/local.md'] },
    { id: 'b', references: ['https://x.dev/llms.txt'] },
    { id: 'c' }, // no references field
  ]
  assert.deepEqual(collectLlmsTxtUrls(items), ['https://x.dev/llms.txt'])
})

test('pruneOrphanedRefs removes cache entries not in keepUrls', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { pruneOrphanedRefs } = await import('../src/refs/fetch-refs.js')
  const { writeCacheMeta, readCacheMeta } = await import('../src/refs/cache-meta.js')

  await fs.writeFile(path.join(dir, 'keep.md'), '# keep')
  await fs.writeFile(path.join(dir, 'drop.md'), '# drop')
  await writeCacheMeta(dir, {
    'https://keep.example/llms.txt': {
      url: 'https://keep.example/llms.txt',
      fetchedAt: '2026-06-24T00:00:00.000Z',
      file: 'keep.md',
    },
    'https://drop.example/llms.txt': {
      url: 'https://drop.example/llms.txt',
      fetchedAt: '2026-06-24T00:00:00.000Z',
      file: 'drop.md',
    },
  })

  const removed = await pruneOrphanedRefs(dir, new Set(['https://keep.example/llms.txt']))
  assert.equal(removed, 1)

  const meta = await readCacheMeta(dir)
  assert.deepEqual(Object.keys(meta), ['https://keep.example/llms.txt'])
  const dropExists = await fs
    .access(path.join(dir, 'drop.md'))
    .then(() => true, () => false)
  const keepExists = await fs
    .access(path.join(dir, 'keep.md'))
    .then(() => true, () => false)
  assert.equal(dropExists, false)
  assert.equal(keepExists, true)
})

test('pruneOrphanedRefs rejects a non-basename file path (path traversal)', async (t) => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-parent-'))
  t.after(async () => fs.rm(parent, { recursive: true }))
  const dir = path.join(parent, 'cache')
  await fs.mkdir(dir)
  const { pruneOrphanedRefs } = await import('../src/refs/fetch-refs.js')
  const { writeCacheMeta, readCacheMeta } = await import('../src/refs/cache-meta.js')

  const outsideFile = path.join(parent, 'secret.txt')
  await fs.writeFile(outsideFile, 'do not delete me')

  await writeCacheMeta(dir, {
    'https://drop.example/llms.txt': {
      url: 'https://drop.example/llms.txt',
      fetchedAt: '2026-06-24T00:00:00.000Z',
      file: '../secret.txt',
    },
  })

  const removed = await pruneOrphanedRefs(dir, new Set())
  assert.equal(removed, 1)

  const meta = await readCacheMeta(dir)
  assert.deepEqual(meta, {})
  const outsideFileStillExists = await fs
    .access(outsideFile)
    .then(() => true, () => false)
  assert.equal(outsideFileStillExists, true)
})

test('pruneOrphanedRefs is a no-op when cache-meta is empty', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const { pruneOrphanedRefs } = await import('../src/refs/fetch-refs.js')
  const removed = await pruneOrphanedRefs(dir, new Set())
  assert.equal(removed, 0)
})

test('haus fetch-refs --help exits 0', async () => {
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--help'], { reject: false })
  assert.equal(result.exitCode, 0)
  assert.ok(result.stdout.includes('fetch-refs'))
})

test('haus fetch-refs --all exits 0 when no llms.txt refs in catalog', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const manifestPath = path.join(dir, 'manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      version: '0.0.1',
      items: [
        {
          id: 'haus.test-item',
          source: 'haus',
          type: 'skill',
          path: 'skills/test',
          title: 'Test',
          purpose: 'test',
          whenToUse: 'test',
          whenNotToUse: 'test',
        },
      ],
    }),
  )
  t.after(async () => fs.rm(dir, { recursive: true }))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--all'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
  assert.equal(result.exitCode, 0)
})

test('haus fetch-refs --id unknown exits 1', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const manifestPath = path.join(dir, 'manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ version: '0.0.1', items: [{ id: 'haus.known-item', source: 'haus', type: 'skill', path: 'skills/test', title: 'Test', purpose: 'test', whenToUse: 'test', whenNotToUse: 'test' }] }),
  )
  t.after(async () => fs.rm(dir, { recursive: true }))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--id', 'haus.does-not-exist'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
  assert.equal(result.exitCode, 1)
})

test('haus fetch-refs --json emits valid JSON', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const manifestPath = path.join(dir, 'manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ version: '0.0.1', items: [{ id: 'haus.test-item', source: 'haus', type: 'skill', path: 'skills/test', title: 'Test', purpose: 'test', whenToUse: 'test', whenNotToUse: 'test' }] }),
  )
  t.after(async () => fs.rm(dir, { recursive: true }))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--all', '--json'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
  assert.equal(result.exitCode, 0)
  const parsed = JSON.parse(result.stdout)
  assert.ok('fetched' in parsed)
  assert.ok('unchanged' in parsed)
  assert.ok('failed' in parsed)
  assert.ok('cachedFiles' in parsed)
})

test('haus apply --write exits 0 after refs integration', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-refs-'))
  t.after(async () => fs.rm(dir, { recursive: true }))
  const hausDir = path.join(dir, '.haus-workflow')
  await fs.mkdir(hausDir)
  await fs.writeFile(
    path.join(hausDir, 'recommendation.json'),
    JSON.stringify({ recommended: [], skipped: [] }),
  )
  const manifestPath = path.join(dir, 'manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ version: '0.0.1', items: [{ id: 'haus.test-item', source: 'haus', type: 'skill', path: 'skills/test', title: 'Test', purpose: 'test', whenToUse: 'test', whenNotToUse: 'test' }] }),
  )
  const result = await execa('node', [DIST_CLI, 'apply', '--write'], {
    cwd: dir,
    reject: false,
    env: {
      ...process.env,
      HAUS_FIXTURE_CATALOG: manifestPath,
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(dir, 'catalog-cache'),
    },
  })
  assert.equal(result.exitCode, 0, `apply failed: ${result.stderr}`)
})

test('haus apply --write only caches llms.txt refs for installed items', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-refs-scope-'))
  t.after(async () => fs.rm(dir, { recursive: true }))

  const { server, port } = await startMockServer({
    '/installed/llms.txt': { body: '# Installed docs' },
    '/uninstalled/llms.txt': { body: '# Uninstalled docs' },
  })
  t.after(() => stopServer(server))

  const skillMd = (name) =>
    `---\nname: ${name}\ndescription: Fixture stub for CLI tests.\n---\n\n# ${name}\n`
  await fs.mkdir(path.join(dir, 'skills/installed-skill'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'skills/installed-skill/SKILL.md'),
    skillMd('installed-skill'),
  )
  await fs.mkdir(path.join(dir, 'skills/uninstalled-skill'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'skills/uninstalled-skill/SKILL.md'),
    skillMd('uninstalled-skill'),
  )

  const manifestPath = path.join(dir, 'manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      version: '0.0.1',
      items: [
        {
          id: 'haus.installed-skill',
          source: 'haus',
          type: 'skill',
          path: 'skills/installed-skill',
          title: 'Installed',
          purpose: 'test',
          whenToUse: 'test',
          whenNotToUse: 'test',
          references: [`http://127.0.0.1:${port}/installed/llms.txt`],
        },
        {
          id: 'haus.uninstalled-skill',
          source: 'haus',
          type: 'skill',
          path: 'skills/uninstalled-skill',
          title: 'Uninstalled',
          purpose: 'test',
          whenToUse: 'test',
          whenNotToUse: 'test',
          references: [`http://127.0.0.1:${port}/uninstalled/llms.txt`],
        },
      ],
    }),
  )

  const hausDir = path.join(dir, '.haus-workflow')
  await fs.mkdir(hausDir, { recursive: true })
  await fs.writeFile(
    path.join(hausDir, 'recommendation.json'),
    JSON.stringify({
      recommended: [
        {
          id: 'haus.installed-skill',
          type: 'skill',
          reason: 'test',
          reasons: [],
          selectionMode: 'manual',
          install: true,
        },
      ],
      skipped: [],
    }),
  )

  const result = await execa('node', [DIST_CLI, 'apply', '--write'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
  assert.equal(result.exitCode, 0, `apply failed: ${result.stderr}`)

  const lock = JSON.parse(await fs.readFile(path.join(hausDir, 'haus.lock.json'), 'utf8'))
  assert.deepEqual(lock.map((e) => e.id), ['haus.installed-skill'])

  const { readCacheMeta } = await import('../src/refs/cache-meta.js')
  const meta = await readCacheMeta(path.join(hausDir, 'llms-cache'))
  const cachedUrls = Object.keys(meta)
  assert.equal(cachedUrls.includes(`http://127.0.0.1:${port}/installed/llms.txt`), true)
  assert.equal(cachedUrls.includes(`http://127.0.0.1:${port}/uninstalled/llms.txt`), false)
})
