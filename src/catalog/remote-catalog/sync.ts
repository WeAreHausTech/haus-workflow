/** Syncs the remote catalog manifest and item content into the local cache. */
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../../types.js'
import { mapWithConcurrency } from '../../utils/fs.js'
import { warn } from '../../utils/logger.js'
import { SUPERPOWERS_SHARED_CATALOG_REL } from '../constants.js'
import { validateCatalogItem } from '../ingest-catalog.js'
import { isSafeCatalogPath, safeJoin } from '../path-safety.js'

import { clearGithubRateLimitHit, getGithubRateLimitHit } from './github-rate-limit.js'
import {
  _resetBlobPathCacheForNewSync,
  listFilesRecursive,
  listFilesUnderCatalogPrefix,
} from './github-tree.js'
import { fetchBytes, fetchText, writeTextIfChanged } from './http.js'
import { fetchRemoteManifest } from './manifest.js'
import { getCacheDir, remoteBase } from './ref.js'

/** Result summary returned by syncRemoteCatalog. */
export type SyncResult = {
  /** IDs of items downloaded for the first time. */
  newItems: string[]
  /** IDs of items whose cached content was replaced because the remote copy changed. */
  refreshed: string[]
  /** Count of items already present in the cache with matching remote content. */
  unchanged: number
  /** IDs of items that could not be fetched or had invalid paths. */
  failed: string[]
  /** Set when any GitHub API call in this sync hit rate limit. */
  rateLimit?: {
    resetAt: number | null
    authenticated: boolean
  }
}

const KNOWN_ITEM_TYPES = new Set(['skill', 'agent', 'template', 'command', 'config'])

function isMarkdownPath(rel: string): boolean {
  return rel.toLowerCase().endsWith('.md')
}

type FetchedFile =
  { rel: string; kind: 'text'; body: string } | { rel: string; kind: 'binary'; body: Buffer }

async function fetchPrefixFiles(
  catalogPrefix: string,
  relFiles: string[],
  base: string,
  label: string,
): Promise<FetchedFile[] | null> {
  const fetched: FetchedFile[] = []
  for (const rel of relFiles) {
    const url = `${base}/${catalogPrefix}/${rel}`
    if (isMarkdownPath(rel)) {
      const text = await fetchText(url)
      if (text === null) {
        warn(`Failed to fetch ${rel} for ${label}`)
        return null
      }
      fetched.push({ rel, kind: 'text', body: text })
    } else {
      const bytes = await fetchBytes(url)
      if (bytes === null) {
        warn(`Failed to fetch ${rel} for ${label}`)
        return null
      }
      fetched.push({ rel, kind: 'binary', body: bytes })
    }
  }
  return fetched
}

function validateMarkdownFiles(item: CatalogItem, fetched: FetchedFile[]): boolean {
  for (const file of fetched) {
    if (file.kind !== 'text' || !isMarkdownPath(file.rel)) continue
    const verdict = validateCatalogItem(item, file.body)
    if (!verdict.ok) {
      warn(`Rejected ${item.id} at ingest: ${verdict.reason}`)
      return false
    }
  }
  return true
}

async function directoryMatchesFetched(destDir: string, fetched: FetchedFile[]): Promise<boolean> {
  if (!(await fs.pathExists(destDir))) return false
  const existing = await listFilesRecursive(destDir)
  const relSet = new Set(fetched.map((f) => f.rel))
  if (existing.length !== fetched.length) return false
  for (const rel of existing) {
    if (!relSet.has(rel)) return false
  }
  for (const file of fetched) {
    const dest = path.join(destDir, file.rel)
    if (!(await fs.pathExists(dest))) return false
    if (file.kind === 'text') {
      const local = await fs.readFile(dest, 'utf8')
      if (local !== file.body) return false
    } else {
      const local = await fs.readFile(dest)
      if (!local.equals(file.body)) return false
    }
  }
  return true
}

async function writeFetchedDirectory(destDir: string, fetched: FetchedFile[]): Promise<void> {
  if (await fs.pathExists(destDir)) {
    await fs.remove(destDir)
  }
  await fs.ensureDir(destDir)
  for (const file of fetched) {
    const dest = path.join(destDir, file.rel)
    await fs.ensureDir(path.dirname(dest))
    if (file.kind === 'text') {
      await fs.writeFile(dest, file.body, 'utf8')
    } else {
      await fs.writeFile(dest, file.body)
    }
  }
}

async function syncDirectoryFromPrefix(
  item: CatalogItem | { id: string; path: string },
  catalogPrefix: string,
  destDir: string,
  base: string,
  opts: { validateMarkdown: boolean; requireSkillMd?: boolean; relFiles?: string[] },
): Promise<'created' | 'updated' | 'unchanged' | 'failed'> {
  // Callers that already listed the prefix can pass relFiles to avoid a second lookup.
  const relFiles = opts.relFiles ?? (await listFilesUnderCatalogPrefix(catalogPrefix, base))
  if (!relFiles) {
    if (!getGithubRateLimitHit()) {
      warn(`Failed to list files for ${item.id}`)
    }
    return 'failed'
  }
  const requireSkillMd = opts.requireSkillMd ?? true
  if (
    requireSkillMd &&
    !relFiles.includes('SKILL.md') &&
    catalogPrefix !== SUPERPOWERS_SHARED_CATALOG_REL
  ) {
    warn(`Failed to fetch content for ${item.id}: missing SKILL.md`)
    return 'failed'
  }
  if (relFiles.length === 0) {
    return 'unchanged'
  }

  const fetched = await fetchPrefixFiles(catalogPrefix, relFiles, base, item.id)
  if (!fetched) return 'failed'

  if (opts.validateMarkdown && 'type' in item) {
    if (!validateMarkdownFiles(item as CatalogItem, fetched)) return 'failed'
  } else if (opts.validateMarkdown) {
    for (const file of fetched) {
      if (file.kind !== 'text' || !isMarkdownPath(file.rel)) continue
      const verdict = validateCatalogItem(
        {
          id: item.id,
          type: 'skill',
          path: catalogPrefix,
          ...('source' in item && item.source ? { source: item.source } : {}),
        },
        file.body,
      )
      if (!verdict.ok) {
        warn(`Rejected ${item.id} at ingest: ${verdict.reason}`)
        return 'failed'
      }
    }
  }

  const existed = await fs.pathExists(destDir)
  if (await directoryMatchesFetched(destDir, fetched)) {
    return 'unchanged'
  }

  await writeFetchedDirectory(destDir, fetched)
  return existed ? 'updated' : 'created'
}

async function syncSkillDirectory(
  item: CatalogItem,
  base: string,
): Promise<'created' | 'updated' | 'unchanged' | 'failed'> {
  const destDir = safeJoin(getCacheDir(), item.path)
  if (!destDir) {
    warn(`Skipping ${item.id}: path traversal detected`)
    return 'failed'
  }
  try {
    return await syncDirectoryFromPrefix(item, item.path, destDir, base, {
      validateMarkdown: true,
    })
  } catch (err) {
    warn(`Failed to cache ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    return 'failed'
  }
}

/**
 * Caches a `config` catalog item. The item.path may point at a single file
 * (e.g. `configs/eslint/eslint.config.mjs`) or a directory of files
 * (e.g. `configs/prettier/`). Directory items are synced whole; single files
 * are fetched and run through the ingest trust boundary before caching.
 */
async function syncConfigItem(
  item: CatalogItem,
  base: string,
): Promise<'created' | 'updated' | 'unchanged' | 'failed'> {
  const dest = safeJoin(getCacheDir(), item.path)
  if (!dest) {
    warn(`Skipping ${item.id}: path traversal detected`)
    return 'failed'
  }

  // Directory config item: listing the prefix returns its files.
  const relFiles = await listFilesUnderCatalogPrefix(item.path, base)
  if (!relFiles && getGithubRateLimitHit()) {
    return 'failed'
  }
  if (relFiles && relFiles.length > 0) {
    try {
      return await syncDirectoryFromPrefix(item, item.path, dest, base, {
        validateMarkdown: true,
        requireSkillMd: false,
        relFiles,
      })
    } catch (err) {
      warn(`Failed to cache ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      return 'failed'
    }
  }

  // Single-file config item. An empty file is valid content (e.g. an empty
  // .prettierignore), so distinguish a fetch error (null) from empty ('').
  const text = await fetchText(`${base}/${item.path}`)
  if (text === null) {
    warn(`Failed to fetch content for ${item.id}`)
    return 'failed'
  }
  const verdict = validateCatalogItem(item, text)
  if (!verdict.ok) {
    warn(`Rejected ${item.id} at ingest: ${verdict.reason}`)
    return 'failed'
  }
  try {
    return await writeTextIfChanged(dest, text)
  } catch (err) {
    warn(`Failed to cache ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    return 'failed'
  }
}

async function syncSuperpowersShared(
  base: string,
): Promise<'created' | 'updated' | 'unchanged' | 'failed' | 'skipped'> {
  const relFiles = await listFilesUnderCatalogPrefix(SUPERPOWERS_SHARED_CATALOG_REL, base)
  if (!relFiles || relFiles.length === 0) return 'skipped'
  const destDir = safeJoin(getCacheDir(), SUPERPOWERS_SHARED_CATALOG_REL)
  if (!destDir) return 'failed'
  try {
    return await syncDirectoryFromPrefix(
      { id: 'haus.superpowers-shared', path: SUPERPOWERS_SHARED_CATALOG_REL },
      SUPERPOWERS_SHARED_CATALOG_REL,
      destDir,
      base,
      { validateMarkdown: true },
    )
  } catch (err) {
    warn(`Failed to cache superpowers shared: ${err instanceof Error ? err.message : String(err)}`)
    return 'failed'
  }
}

async function syncOneItem(
  item: CatalogItem,
  base: string,
): Promise<'created' | 'updated' | 'unchanged' | 'failed'> {
  if (!KNOWN_ITEM_TYPES.has(item.type)) {
    warn(
      `Skipping ${item.id}: type "${item.type}" is unknown to this haus version — upgrade to use it`,
    )
    return 'failed'
  }
  if (!item.path) return 'failed'
  if (!isSafeCatalogPath(item.path)) {
    warn(`Skipping ${item.id}: invalid path "${item.path}"`)
    return 'failed'
  }

  if (item.type === 'skill') {
    return syncSkillDirectory(item, base)
  }

  if (item.type === 'config') {
    return syncConfigItem(item, base)
  }

  const dest = safeJoin(getCacheDir(), item.path)
  if (!dest) {
    warn(`Skipping ${item.id}: path traversal detected`)
    return 'failed'
  }
  const text = await fetchText(`${base}/${item.path}`)
  // fetchText returns null on fetch failure and '' for a legitimately empty file;
  // only the former is an error (mirror syncConfigItem, which also tests === null).
  if (text === null) {
    warn(`Failed to fetch content for ${item.id}`)
    return 'failed'
  }
  const verdict = validateCatalogItem(item, text)
  if (!verdict.ok) {
    warn(`Rejected ${item.id} at ingest: ${verdict.reason}`)
    return 'failed'
  }
  try {
    return await writeTextIfChanged(dest, text)
  } catch (err) {
    warn(`Failed to cache ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    return 'failed'
  }
}

/**
 * Fetches the remote manifest and downloads any new skill/agent files into the local cache.
 * Skips items that already exist; logs a warning and falls back to the bundled catalog on failure.
 */
export async function syncRemoteCatalog(): Promise<SyncResult> {
  _resetBlobPathCacheForNewSync()
  clearGithubRateLimitHit()

  const manifest = await fetchRemoteManifest()
  if (!manifest) {
    warn('Remote catalog fetch failed — using bundled catalog')
    return { newItems: [], refreshed: [], unchanged: 0, failed: [] }
  }
  const { version, items } = manifest

  const cacheDir = getCacheDir()
  try {
    await fs.ensureDir(cacheDir)
    await fs.writeFile(
      path.join(cacheDir, 'manifest.json'),
      `${JSON.stringify({ version, items }, null, 2)}\n`,
      'utf8',
    )
  } catch (err) {
    warn(
      `Catalog cache not writable (${cacheDir}) — skipping cache sync: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { newItems: [], refreshed: [], unchanged: 0, failed: [] }
  }

  const newItems: string[] = []
  const refreshed: string[] = []
  let unchanged = 0
  const failed: string[] = []
  const base = await remoteBase()

  const outcomes = await mapWithConcurrency(items, (item) => syncOneItem(item, base), 8)
  const sharedOutcome = await syncSuperpowersShared(base)
  if (sharedOutcome === 'failed' && !getGithubRateLimitHit()) {
    warn('Failed to cache superpowers shared support files')
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const outcome = outcomes[i]!
    if (outcome === 'created') newItems.push(item.id)
    else if (outcome === 'updated') refreshed.push(item.id)
    else if (outcome === 'unchanged') unchanged++
    else if (outcome === 'failed') failed.push(item.id)
  }

  const rateLimit = getGithubRateLimitHit()
  if (rateLimit) {
    warn('Catalog tree listing blocked by GitHub API rate limit')
  }

  return {
    newItems,
    refreshed,
    unchanged,
    failed,
    ...(rateLimit ? { rateLimit } : {}),
  }
}

/** Returns milliseconds since the cache manifest was last written, or null if absent. */
export async function getCacheManifestAge(): Promise<number | null> {
  try {
    const stat = await fs.stat(path.join(getCacheDir(), 'manifest.json'))
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}
