# llms.txt Reference Fetching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `references` llms.txt URLs in catalog items consumable — fetch and cache them via a new `haus fetch-refs` command (auto-called on `haus apply --write`), and update each affected skill's SKILL.md to tell agents where to find the cached docs and how to refresh.

**Architecture:** New `src/refs/` module in the CLI repo owns fetch + etag cache-meta logic. Cache lives at `<project-root>/.haus-workflow/llms-cache/` (project-local, gitignored). Each llms.txt URL is fetched with `If-None-Match`/`If-Modified-Since` headers; a 304 skips the write. Cache metadata stored in `.haus-workflow/llms-cache/cache-meta.json`. `haus apply --write` calls fetch-refs for all items automatically (non-blocking; failures warn, never abort apply). Each affected SKILL.md in the catalog repo gets a standardized "Reference Documentation" section instructing agents to run `haus fetch-refs --id <id>` and read the cached file.

**Tech Stack:** Node.js built-in `fetch`, `fs-extra`, TypeScript, `commander`, existing `src/utils/paths.ts#hausPath`, `src/catalog/load-catalog.ts#loadCatalog`. Catalog: YAML frontmatter + Markdown, `yarn validate`.

**Repos:**

- CLI: `/Users/aniisabihi/Documents/GitHub/haus-workflow`
- Catalog: `/Users/aniisabihi/Documents/GitHub/haus-workflow-catalog`

---

## File Map

### haus-workflow (CLI)

| Action | Path                         | Responsibility                                                  |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| Create | `src/refs/cache-meta.ts`     | `RefEntry` type, read/write `cache-meta.json`                   |
| Create | `src/refs/fetch-refs.ts`     | URL → slug, conditional fetch, orchestrate multi-item fetch     |
| Create | `src/commands/fetch-refs.ts` | CLI command handler (`runFetchRefs`) — prints cache file paths  |
| Modify | `src/cli.ts`                 | Register `fetch-refs` command                                   |
| Modify | `src/commands/apply.ts`      | Call `fetchRefsForItems` in write mode after `writeClaudeFiles` |
| Create | `tests/fetch-refs.test.js`   | Unit + integration tests with mock HTTP server                  |

### haus-workflow-catalog (Catalog)

| Action | Path                                    | Responsibility                        |
| ------ | --------------------------------------- | ------------------------------------- |
| Modify | `skills/ecc/bullmq-patterns/SKILL.md`   | Add "Reference Documentation" section |
| Modify | `skills/ecc/prisma-patterns/SKILL.md`   | Add "Reference Documentation" section |
| Modify | `skills/ecc/vue-patterns/SKILL.md`      | Add "Reference Documentation" section |
| Modify | `skills/<path>/i18next/SKILL.md`        | Add "Reference Documentation" section |
| Modify | `skills/<path>/laravel-nova/SKILL.md`   | Add "Reference Documentation" section |
| Modify | `skills/<path>/nx/SKILL.md`             | Add "Reference Documentation" section |
| Modify | `skills/sanity/*/SKILL.md`              | Add "Reference Documentation" section |
| Modify | `skills/<path>/storybook/SKILL.md`      | Add "Reference Documentation" section |
| Modify | `skills/<path>/strapi/SKILL.md`         | Add "Reference Documentation" section |
| Modify | `skills/<path>/tanstack/SKILL.md`       | Add "Reference Documentation" section |
| Modify | `skills/<path>/turbo/SKILL.md`          | Add "Reference Documentation" section |
| Modify | `skills/<path>/vendure-*/SKILL.md` (×2) | Add "Reference Documentation" section |
| Modify | `manifest.json`                         | Bump version for every changed item   |

> Exact skill paths: resolve at execution time with `grep -r "llms.txt" manifest.json` to get item ids, then map to `path` fields.

---

## Task 1: Cache-meta module (CLI repo)

**Files:**

- Create: `src/refs/cache-meta.ts`
- Create: `tests/fetch-refs.test.js` (scaffolded here, expanded in later tasks)

- [ ] **Step 1: Write failing tests**

Create `tests/fetch-refs.test.js`:

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'

// Tests import from dist/ — always run `yarn build` before `node --test`.

test('readCacheMeta returns empty object when file missing', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { readCacheMeta } = await import('../dist/refs/cache-meta.js')
  const meta = await readCacheMeta(dir)
  assert.deepEqual(meta, {})
  await fs.rm(dir, { recursive: true })
})

test('writeCacheMeta + readCacheMeta round-trips', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { readCacheMeta, writeCacheMeta } = await import('../dist/refs/cache-meta.js')
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
  assert.deepEqual(result, meta)
  await fs.rm(dir, { recursive: true })
})
```

Run: `node --test tests/fetch-refs.test.js`
Expected: FAIL — `dist/refs/cache-meta.js` does not exist.

- [ ] **Step 2: Implement `src/refs/cache-meta.ts`**

```typescript
/** Cache metadata for fetched llms.txt references. */
import path from 'node:path'

import fs from 'fs-extra'

export type RefEntry = {
  url: string
  etag?: string
  lastModified?: string
  fetchedAt: string
  file: string
}

export type RefsCacheMeta = Record<string, RefEntry>

const META_FILENAME = 'cache-meta.json'

export async function readCacheMeta(cacheDir: string): Promise<RefsCacheMeta> {
  const metaPath = path.join(cacheDir, META_FILENAME)
  try {
    const raw = await fs.readFile(metaPath, 'utf8')
    return JSON.parse(raw) as RefsCacheMeta
  } catch {
    return {}
  }
}

export async function writeCacheMeta(cacheDir: string, meta: RefsCacheMeta): Promise<void> {
  await fs.ensureDir(cacheDir)
  const metaPath = path.join(cacheDir, META_FILENAME)
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8')
}
```

- [ ] **Step 3: Build and run tests**

```bash
yarn build && node --test tests/fetch-refs.test.js
```

Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/refs/cache-meta.ts tests/fetch-refs.test.js
git commit -m "feat(refs): add cache-meta read/write module"
```

---

## Task 2: Core fetch logic (CLI repo)

**Files:**

- Create: `src/refs/fetch-refs.ts`
- Modify: `tests/fetch-refs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/fetch-refs.test.js`:

```javascript
import http from 'node:http'

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

test('urlToSlug converts URL to safe filename stem', async () => {
  const { urlToSlug } = await import('../dist/refs/fetch-refs.js')
  assert.equal(urlToSlug('https://www.prisma.io/llms.txt'), 'www-prisma-io-llms-txt')
  assert.equal(urlToSlug('https://docs.bullmq.io/llms.txt'), 'docs-bullmq-io-llms-txt')
  assert.equal(urlToSlug('https://tanstack.com/llms.txt'), 'tanstack-com-llms-txt')
})

test('fetchSingleRef downloads content and stores etag', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { fetchSingleRef } = await import('../dist/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { body: '# Prisma docs', headers: { etag: '"v1"' } },
  })

  const url = `http://127.0.0.1:${port}/llms.txt`
  const meta = {}
  const result = await fetchSingleRef(url, dir, meta)

  assert.equal(result, 'fetched')
  assert.ok(meta[url])
  assert.equal(meta[url].etag, '"v1"')
  assert.ok(meta[url].file.endsWith('.md'))

  const written = await fs.readFile(path.join(dir, meta[url].file), 'utf8')
  assert.equal(written, '# Prisma docs')

  await stopServer(server)
  await fs.rm(dir, { recursive: true })
})

test('fetchSingleRef returns unchanged on 304', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { fetchSingleRef } = await import('../dist/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { status: 304, body: '' },
  })

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
  assert.equal(result, 'unchanged')

  await stopServer(server)
  await fs.rm(dir, { recursive: true })
})

test('fetchSingleRef returns failed on network error', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { fetchSingleRef } = await import('../dist/refs/fetch-refs.js')

  const url = 'http://127.0.0.1:1/llms.txt' // nothing listening
  const meta = {}
  const result = await fetchSingleRef(url, dir, meta)
  assert.equal(result, 'failed')

  await fs.rm(dir, { recursive: true })
})

test('fetchRefsForItems fetches llms.txt URLs only, skips local refs', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { fetchRefsForItems } = await import('../dist/refs/fetch-refs.js')

  const { server, port } = await startMockServer({
    '/llms.txt': { body: '# BullMQ docs', headers: { etag: '"bq1"' } },
  })

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

  await stopServer(server)
  await fs.rm(dir, { recursive: true })
})

test('fetchRefsForItems deduplicates URLs across items', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-refs-'))
  const { fetchRefsForItems } = await import('../dist/refs/fetch-refs.js')

  let fetchCount = 0
  const { server, port } = await startMockServer({
    '/llms.txt': {
      get body() {
        fetchCount++
        return '# Docs'
      },
    },
  })

  const url = `http://127.0.0.1:${port}/llms.txt`
  const items = [
    { id: 'haus.a', references: [url] },
    { id: 'haus.b', references: [url] }, // same URL — should only fetch once
  ]

  const summary = await fetchRefsForItems(items, dir)
  assert.equal(summary.fetched, 1)
  assert.equal(fetchCount, 1)

  await stopServer(server)
  await fs.rm(dir, { recursive: true })
})
```

Run: `node --test tests/fetch-refs.test.js`
Expected: 5 new tests FAIL — `dist/refs/fetch-refs.js` does not exist.

- [ ] **Step 2: Implement `src/refs/fetch-refs.ts`**

```typescript
/** Fetches llms.txt references from catalog items with etag-based caching. */
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../types.js'

import type { RefsCacheMeta } from './cache-meta.js'
import { readCacheMeta, writeCacheMeta } from './cache-meta.js'

export type FetchRefResult = 'fetched' | 'unchanged' | 'failed'

export type FetchRefsSummary = {
  fetched: number
  unchanged: number
  failed: number
  failedUrls: string[]
  /** Absolute paths of files written or already cached, keyed by source URL. */
  cachedFiles: Record<string, string>
}

/** Converts a URL to a safe filename stem. e.g. https://www.prisma.io/llms.txt → www-prisma-io-llms-txt */
export function urlToSlug(url: string): string {
  const u = new URL(url)
  return (u.hostname + u.pathname)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/** Returns true when a reference URL points to an llms.txt file (http or https). */
export function isLlmsTxtUrl(ref: string): boolean {
  try {
    const u = new URL(ref)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.pathname.endsWith('/llms.txt')
  } catch {
    return false
  }
}

/**
 * Fetches a single llms.txt URL into cacheDir using etag/Last-Modified for
 * conditional requests. Mutates `meta` in place on a successful fetch.
 */
export async function fetchSingleRef(
  url: string,
  cacheDir: string,
  meta: RefsCacheMeta,
): Promise<FetchRefResult> {
  const existing = meta[url]
  const headers: Record<string, string> = {}
  if (existing?.etag) headers['If-None-Match'] = existing.etag
  if (existing?.lastModified) headers['If-Modified-Since'] = existing.lastModified

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    if (res.status === 304) return 'unchanged'
    if (!res.ok) return 'failed'

    const text = await res.text()
    const file = `${urlToSlug(url)}.md`
    await fs.ensureDir(cacheDir)
    await fs.writeFile(path.join(cacheDir, file), text, 'utf8')

    meta[url] = {
      url,
      etag: res.headers.get('etag') ?? undefined,
      lastModified: res.headers.get('last-modified') ?? undefined,
      fetchedAt: new Date().toISOString(),
      file,
    }
    return 'fetched'
  } catch {
    return 'failed'
  }
}

/**
 * Fetches all llms.txt references from the given catalog items into cacheDir.
 * Deduplicates URLs, reads existing etag metadata, writes updated metadata after fetching.
 * Network failures are captured in the summary — never throws.
 */
export async function fetchRefsForItems(
  items: Pick<CatalogItem, 'id' | 'references'>[],
  cacheDir: string,
): Promise<FetchRefsSummary> {
  const urls = [...new Set(items.flatMap((item) => (item.references ?? []).filter(isLlmsTxtUrl)))]

  const summary: FetchRefsSummary = {
    fetched: 0,
    unchanged: 0,
    failed: 0,
    failedUrls: [],
    cachedFiles: {},
  }
  if (urls.length === 0) return summary

  const meta = await readCacheMeta(cacheDir)

  await Promise.all(
    urls.map(async (url) => {
      const result = await fetchSingleRef(url, cacheDir, meta)
      if (result === 'fetched') {
        summary.fetched++
        summary.cachedFiles[url] = path.join(cacheDir, meta[url].file)
      } else if (result === 'unchanged') {
        summary.unchanged++
        if (meta[url]?.file) summary.cachedFiles[url] = path.join(cacheDir, meta[url].file)
      } else {
        summary.failed++
        summary.failedUrls.push(url)
      }
    }),
  )

  if (summary.fetched > 0) {
    await writeCacheMeta(cacheDir, meta)
  }

  return summary
}
```

- [ ] **Step 3: Build and run tests**

```bash
yarn build && node --test tests/fetch-refs.test.js
```

Expected: all 8 tests PASS (2 cache-meta + 6 fetch-refs).

- [ ] **Step 4: Commit**

```bash
git add src/refs/fetch-refs.ts tests/fetch-refs.test.js
git commit -m "feat(refs): add llms.txt fetch with etag caching"
```

---

## Task 3: CLI command (CLI repo)

**Files:**

- Create: `src/commands/fetch-refs.ts`
- Modify: `src/cli.ts`
- Modify: `tests/fetch-refs.test.js`

Standards from the command audit (cf147f9):

- `--json` flag: log `JSON.stringify(summary)` and return early (same pattern as `scan`, `recommend`)
- `process.exitCode = 1` only for hard failures (`--id` not found); partial network failures are `warn()`, not exit 1
- EPERM hardening: wrap `loadCatalog` in try/catch so an unreadable catalog dir doesn't crash the command
- Each item reported once — no double-logging

- [ ] **Step 1: Write failing CLI tests**

Append to `tests/fetch-refs.test.js`:

```javascript
import { execa } from 'execa'
const DIST_CLI = path.resolve('dist/cli.js')

test('haus fetch-refs --help exits 0', async () => {
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--help'], { reject: false })
  assert.equal(result.exitCode, 0)
  assert.ok(result.stdout.includes('fetch-refs'))
})

test('haus fetch-refs --all exits 0 when no llms.txt refs in catalog', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--all'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: '1' },
  })
  assert.equal(result.exitCode, 0)
  await fs.rm(dir, { recursive: true })
})

test('haus fetch-refs --id unknown exits 1', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--id', 'haus.does-not-exist'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: '1' },
  })
  assert.equal(result.exitCode, 1)
  await fs.rm(dir, { recursive: true })
})

test('haus fetch-refs --json emits valid JSON', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-proj-'))
  const result = await execa('node', [DIST_CLI, 'fetch-refs', '--all', '--json'], {
    cwd: dir,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: '1' },
  })
  assert.equal(result.exitCode, 0)
  const parsed = JSON.parse(result.stdout)
  assert.ok('fetched' in parsed)
  assert.ok('unchanged' in parsed)
  assert.ok('failed' in parsed)
  assert.ok('cachedFiles' in parsed)
  await fs.rm(dir, { recursive: true })
})
```

Run: `yarn build && node --test tests/fetch-refs.test.js`
Expected: 4 new tests FAIL — command not registered.

- [ ] **Step 2: Create `src/commands/fetch-refs.ts`**

```typescript
/** `haus fetch-refs` — fetches and caches llms.txt content from catalog item references. */
import { loadCatalog } from '../catalog/load-catalog.js'
import { fetchRefsForItems } from '../refs/fetch-refs.js'
import { log, warn } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

const REFS_CACHE_SUBDIR = 'llms-cache'

/**
 * Fetches llms.txt references for catalog items into .haus-workflow/llms-cache/.
 * --all (default): fetch for all catalog items with llms.txt references.
 * --id <id>: fetch for a single catalog item; exits 1 if id is not found.
 * --json: emit a single JSON document to stdout instead of human lines.
 * Partial network failures are reported as warnings, not exit 1.
 */
export async function runFetchRefs(options: {
  all?: boolean
  id?: string
  json?: boolean
}): Promise<void> {
  const root = process.cwd()
  const cacheDir = hausPath(root, REFS_CACHE_SUBDIR)

  let allItems
  try {
    allItems = await loadCatalog(root)
  } catch (err) {
    warn(`Could not load catalog: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
    return
  }

  let items = allItems
  if (options.id) {
    items = allItems.filter((item) => item.id === options.id)
    if (items.length === 0) {
      warn(`No catalog item found with id "${options.id}".`)
      process.exitCode = 1
      return
    }
  }

  const withRefs = items.filter((item) => (item.references ?? []).length > 0)

  if (withRefs.length === 0) {
    if (options.json) {
      log(
        JSON.stringify(
          { fetched: 0, unchanged: 0, failed: 0, failedUrls: [], cachedFiles: {} },
          null,
          2,
        ),
      )
    } else {
      log('No catalog items with llms.txt references found.')
    }
    return
  }

  const summary = await fetchRefsForItems(withRefs, cacheDir)

  if (options.json) {
    log(JSON.stringify(summary, null, 2))
    return
  }

  for (const [url, filePath] of Object.entries(summary.cachedFiles)) {
    log(`Cached: ${filePath}  (${url})`)
  }
  if (summary.fetched > 0) log(`Fetched: ${summary.fetched} URL(s)`)
  if (summary.unchanged > 0) log(`Unchanged (etag match): ${summary.unchanged} URL(s)`)
  if (summary.failed > 0) {
    // Network failures warn but do not exit 1 — partial success is still a success
    warn(`Failed to fetch ${summary.failed} URL(s): ${summary.failedUrls.join(', ')}`)
  }
  if (summary.fetched === 0 && summary.unchanged > 0 && summary.failed === 0) {
    log('All references up to date.')
  }
}
```

- [ ] **Step 3: Register in `src/cli.ts`**

Add import (alphabetical by local path, after existing imports):

```typescript
import { runFetchRefs } from './commands/fetch-refs.js'
```

Add command (after the existing `doctor` command block):

```typescript
program
  .command('fetch-refs')
  .description('Fetch and cache llms.txt content from catalog item references')
  .option('--all', 'Fetch for all catalog items (default)')
  .option('--id <id>', 'Fetch for a single catalog item by id')
  .option('--json', 'Emit machine-readable JSON summary to stdout')
  .action(runFetchRefs)
```

- [ ] **Step 4: Build and run tests**

```bash
yarn build && node --test tests/fetch-refs.test.js
```

Expected: all 12 tests PASS (2 cache-meta + 6 fetch-refs core + 4 CLI).

- [ ] **Step 5: Manual smoke test**

```bash
yarn dev fetch-refs --all
yarn dev fetch-refs --all --json | jq .
```

Expected: human output lists cached file paths; JSON output is a single parseable document.

- [ ] **Step 6: Commit**

```bash
git add src/commands/fetch-refs.ts src/cli.ts tests/fetch-refs.test.js
git commit -m "feat(refs): add haus fetch-refs CLI command"
```

---

## Task 4: Integrate into `haus apply --write` (CLI repo)

**Files:**

- Modify: `src/commands/apply.ts`
- Modify: `tests/fetch-refs.test.js`

- [ ] **Step 1: Write regression test — apply must not break**

Append to `tests/fetch-refs.test.js`:

```javascript
test('haus apply --write exits 0 after refs integration', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-refs-'))
  const hausDir = path.join(dir, '.haus-workflow')
  await fs.mkdir(hausDir)
  await fs.writeFile(
    path.join(hausDir, 'recommendation.json'),
    JSON.stringify({ recommended: [], skipped: [] }),
  )
  const result = await execa('node', [DIST_CLI, 'apply', '--write'], {
    cwd: dir,
    reject: false,
    env: {
      ...process.env,
      HAUS_FIXTURE_CATALOG: '1',
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(dir, 'catalog-cache'),
    },
  })
  assert.equal(result.exitCode, 0, `apply failed: ${result.stderr}`)
  await fs.rm(dir, { recursive: true })
})
```

Run: `yarn build && node --test tests/fetch-refs.test.js`
Expected: PASS (apply already works; baseline before our edit).

- [ ] **Step 2: Edit `src/commands/apply.ts`**

Add two imports after the existing import block (`hausPath` is already imported — do NOT add it again):

```typescript
import { loadCatalog } from '../catalog/load-catalog.js'
import { fetchRefsForItems } from '../refs/fetch-refs.js'
```

The current tail of `runApply` (after `writeClaudeFiles`) is:

```typescript
  const files = await writeClaudeFiles(root, isDryRun, selectedIds, {
    refillConfig: options.refillConfig,
    force: options.force,
  })
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`)
  } else {
    log('Applied files:')
    files.forEach((f) => log(`- ${displayPath(root, f)}`))
  }
}
```

Replace it with (adds refs fetch between `writeClaudeFiles` and the log block):

```typescript
  const files = await writeClaudeFiles(root, isDryRun, selectedIds, {
    refillConfig: options.refillConfig,
    force: options.force,
  })

  if (!isDryRun) {
    // Best-effort: fetch llms.txt refs for all catalog items. Warn on failure, never abort apply.
    try {
      const cacheDir = hausPath(root, 'llms-cache')
      const allItems = await loadCatalog(root)
      const summary = await fetchRefsForItems(allItems, cacheDir)
      if (summary.fetched > 0) log(`Fetched ${summary.fetched} llms.txt reference(s) to ${cacheDir}`)
      if (summary.failed > 0) warn(`Failed to fetch ${summary.failed} llms.txt reference(s): ${summary.failedUrls.join(', ')}`)
    } catch (err) {
      warn(`Could not fetch llms.txt references: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`)
  } else {
    log('Applied files:')
    files.forEach((f) => log(`- ${displayPath(root, f)}`))
  }
}
```

- [ ] **Step 3: Run full test suite**

```bash
yarn build && yarn test
```

Expected: all tests PASS. The try/catch in apply guards against any network failures in tests.

- [ ] **Step 4: Commit**

```bash
git add src/commands/apply.ts tests/fetch-refs.test.js
git commit -m "feat(refs): auto-fetch llms.txt references on haus apply --write"
```

---

## Task 5: Verify CLI gate (CLI repo)

- [ ] **Step 1: Run full verify**

```bash
yarn verify
```

Expected: typecheck + lint + build + test all pass.

- [ ] **Step 2: Check .haus-workflow is gitignored**

```bash
grep "haus-workflow" .gitignore
```

Expected: `.haus-workflow/` already appears. If not, add it and commit:

```bash
echo '.haus-workflow/' >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .haus-workflow/"
```

- [ ] **Step 3: Manual end-to-end**

In a project that has haus set up (not the CLI repo itself):

```bash
haus apply --write
```

Expected output includes `Fetched N llms.txt reference(s) to .haus-workflow/llms-cache`. Verify files exist:

```bash
ls .haus-workflow/llms-cache/
# Expected: www-prisma-io-llms-txt.md, cache-meta.json, etc.
```

---

## Task 6: Add "Reference Documentation" sections to skills (Catalog repo)

**Working directory:** `/Users/aniisabihi/Documents/GitHub/haus-workflow-catalog`

Skills that need updates are those whose manifest entry has a `references` field containing `llms.txt`. Find them:

- [ ] **Step 1: Identify affected skills and their cache filenames**

```bash
node -e "
const m = JSON.parse(require('fs').readFileSync('manifest.json','utf8'));
m.items.filter(i => i.references?.some(r => r.endsWith('/llms.txt'))).forEach(i => {
  i.references.filter(r => r.endsWith('/llms.txt')).forEach(url => {
    const slug = (new URL(url).hostname + new URL(url).pathname)
      .replace(/[^a-zA-Z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-\$/g,'').toLowerCase()
    console.log(i.id, i.path, url, slug + '.md')
  })
})
"
```

Expected output: one line per item — `id`, `path`, `url`, `cache filename`. Record these — you'll use them in the next step.

- [ ] **Step 2: Update each affected SKILL.md**

For **each** item from the output above, open `<path>/SKILL.md` and append this section at the end of the file. Replace `<ITEM_ID>`, `<CACHE_FILENAME>`, and `<URL>` with the values from Step 1:

````markdown
## Reference Documentation

Up-to-date API docs are cached locally by haus.

To refresh (uses etag — fast if unchanged):

```bash
haus fetch-refs --id <ITEM_ID>
```
````

Then read `.haus-workflow/llms-cache/<CACHE_FILENAME>` for current API reference.

Source: <URL>

````

Example for `haus.ecc-prisma-patterns` (url: `https://www.prisma.io/llms.txt`, cache: `www-prisma-io-llms-txt.md`):

```markdown

## Reference Documentation

Up-to-date API docs are cached locally by haus.

To refresh (uses etag — fast if unchanged):

```bash
haus fetch-refs --id haus.ecc-prisma-patterns
````

Then read `.haus-workflow/llms-cache/www-prisma-io-llms-txt.md` for current Prisma API reference.

Source: https://www.prisma.io/llms.txt

````

- [ ] **Step 3: Validate catalog**

```bash
yarn validate
````

Expected: PASS. If skill validation fails (e.g. forbidden content pattern), fix the offending section — the "Reference Documentation" heading and bash block should be fine.

- [ ] **Step 4: Run tests**

```bash
yarn test
```

Expected: PASS.

---

## Task 7: Bump item versions and release catalog (Catalog repo)

- [ ] **Step 1: Bump version for every changed item in `manifest.json`**

For each item you edited in Task 6, find its entry in `manifest.json` and bump its `version` field by a patch increment (e.g. `"1.0.2"` → `"1.0.3"`). Use the list from Task 6 Step 1 to ensure no item is missed.

Validate the bumps:

```bash
yarn validate
```

Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add manifest.json skills/
git commit -m "feat(skills): add Reference Documentation section to llms.txt-referenced skills"
```

- [ ] **Step 3: Open PR in catalog repo**

```bash
gh pr create \
  --title "feat(skills): add llms-cache reference docs to skills with llms.txt" \
  --body "Adds a 'Reference Documentation' section to each skill that has an llms.txt URL in its manifest references field. Agents can now run \`haus fetch-refs --id <id>\` to refresh the cache and read the cached file for current API docs. Requires haus-workflow CLI v0.32+ for the fetch-refs command."
```

---

## Consumed content: agent flow end-to-end

After both repos are shipped:

1. User runs `haus apply --write` → CLI fetches llms.txt refs → `.haus-workflow/llms-cache/*.md` populated.
2. Agent invokes a skill (e.g. prisma-patterns) → skill instructions say "run `haus fetch-refs --id haus.ecc-prisma-patterns`" → CLI sends `If-None-Match` header → 304 if unchanged (fast) or fresh content written.
3. Agent reads `.haus-workflow/llms-cache/www-prisma-io-llms-txt.md` → current Prisma API docs in context.
