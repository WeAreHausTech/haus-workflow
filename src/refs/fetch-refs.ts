/** Fetches llms.txt references from catalog items with etag-based caching. */
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../types.js'

import type { RefsCacheMeta } from './cache-meta.js'
import { readCacheMeta, writeCacheMeta } from './cache-meta.js'

export type FetchRefResult = 'fetched' | 'unchanged' | 'failed'

export type FetchSingleRefOutcome =
  | { result: 'fetched'; file: string }
  | { result: 'unchanged' }
  | { result: 'failed' }

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
 * Returns an outcome object with the file path on success.
 */
export async function fetchSingleRef(
  url: string,
  cacheDir: string,
  meta: RefsCacheMeta,
): Promise<FetchSingleRefOutcome> {
  const existing = meta[url]
  const headers: Record<string, string> = {}
  if (existing?.etag) headers['If-None-Match'] = existing.etag
  if (existing?.lastModified) headers['If-Modified-Since'] = existing.lastModified

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    if (res.status === 304) return { result: 'unchanged' }
    if (!res.ok) return { result: 'failed' }

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
    return { result: 'fetched', file }
  } catch {
    return { result: 'failed' }
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
      const outcome = await fetchSingleRef(url, cacheDir, meta)
      if (outcome.result === 'fetched') {
        summary.fetched++
        summary.cachedFiles[url] = path.join(cacheDir, outcome.file)
      } else if (outcome.result === 'unchanged') {
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
