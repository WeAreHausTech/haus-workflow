/**
 * Fetches the catalog manifest from the remote haus-workflow-catalog repo via git tag.
 * Caches downloaded content under ~/.claude/haus/catalog-cache/ (overridable in tests).
 */

import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../types.js'
import { warn } from '../utils/logger.js'

import { CATALOG_CACHE_SUBDIR, CATALOG_REF, CATALOG_REPO_URL } from './constants.js'

// HAUS_CATALOG_CACHE_DIR_OVERRIDE redirects cache writes/reads for isolated tests.
export const CACHE_DIR =
  process.env['HAUS_CATALOG_CACHE_DIR_OVERRIDE'] ?? path.join(os.homedir(), CATALOG_CACHE_SUBDIR)
// HAUS_CATALOG_REMOTE_BASE allows tests to point at a local mock server.
const REMOTE_BASE = process.env['HAUS_CATALOG_REMOTE_BASE'] ?? `${CATALOG_REPO_URL}/${CATALOG_REF}`
const REMOTE_MANIFEST_URL = `${REMOTE_BASE}/manifest.json`

/** Fetches raw text from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Downloads and parses the remote manifest; returns null if fetch or parse fails. */
export async function fetchRemoteManifest(): Promise<CatalogItem[] | null> {
  const text = await fetchText(REMOTE_MANIFEST_URL)
  if (!text) return null
  try {
    const data = JSON.parse(text) as { items?: CatalogItem[] }
    return data?.items?.length ? data.items : null
  } catch {
    return null
  }
}

/** Relative path of the workflow standard template within the catalog. */
export const WORKFLOW_TEMPLATE_REL = 'templates/agentic-workflow-standard.md'

/**
 * Ensures the workflow standard template is present in the cache, fetching it from the
 * remote catalog on demand when missing. Returns the cached file path, or null when it
 * cannot be obtained (e.g. offline with no prior cache). Lets `haus init` write
 * WORKFLOW.md on a fresh install without a separate `haus update` step.
 */
export async function ensureWorkflowTemplate(): Promise<string | null> {
  const dest = path.join(CACHE_DIR, WORKFLOW_TEMPLATE_REL)
  if (await fs.pathExists(dest)) return dest
  const text = await fetchText(`${REMOTE_BASE}/${WORKFLOW_TEMPLATE_REL}`)
  if (!text) return null
  await fs.ensureDir(path.dirname(dest))
  await fs.writeFile(dest, text, 'utf8')
  return dest
}

/** Result summary returned by syncRemoteCatalog. */
export type SyncResult = {
  /** IDs of items downloaded for the first time. */
  newItems: string[]
  /** Count of items already present in the cache (skipped). */
  unchanged: number
  /** IDs of items that could not be fetched or had invalid paths. */
  failed: string[]
}

/** Guards against path traversal: rejects absolute paths, backslashes, and `..` segments. */
function isSafeCatalogPath(itemPath: string): boolean {
  if (!itemPath || path.isAbsolute(itemPath) || itemPath.includes('\\')) return false
  const normalized = path.normalize(itemPath)
  return !normalized.startsWith('..') && !normalized.includes('/..')
}

/** Resolves itemPath under base; returns null if the result escapes the base directory. */
function safeJoin(base: string, itemPath: string): string | null {
  if (!isSafeCatalogPath(itemPath)) return null
  const resolved = path.resolve(base, itemPath)
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null
}

/**
 * Fetches the remote manifest and downloads any new skill/agent files into the local cache.
 * Skips items that already exist; logs a warning and falls back to the bundled catalog on failure.
 */
export async function syncRemoteCatalog(): Promise<SyncResult> {
  const items = await fetchRemoteManifest()
  if (!items) {
    warn('Remote catalog fetch failed — using bundled catalog')
    return { newItems: [], unchanged: 0, failed: [] }
  }

  await fs.ensureDir(CACHE_DIR)
  await fs.writeFile(
    path.join(CACHE_DIR, 'manifest.json'),
    `${JSON.stringify({ items }, null, 2)}\n`,
    'utf8',
  )

  const newItems: string[] = []
  let unchanged = 0
  const failed: string[] = []

  for (const item of items) {
    if ((item.type !== 'skill' && item.type !== 'agent' && item.type !== 'template') || !item.path)
      continue
    if (!isSafeCatalogPath(item.path)) {
      warn(`Skipping ${item.id}: invalid path "${item.path}"`)
      failed.push(item.id)
      continue
    }

    if (item.type === 'skill') {
      const destDir = safeJoin(CACHE_DIR, item.path)
      if (!destDir) {
        warn(`Skipping ${item.id}: path traversal detected`)
        failed.push(item.id)
        continue
      }
      const dest = path.join(destDir, 'SKILL.md')
      if (await fs.pathExists(dest)) {
        unchanged++
        continue
      }
      const url = `${REMOTE_BASE}/${item.path}/SKILL.md`
      const text = await fetchText(url)
      if (!text) {
        warn(`Failed to fetch content for ${item.id}`)
        failed.push(item.id)
        continue
      }
      await fs.ensureDir(path.dirname(dest))
      await fs.writeFile(dest, text, 'utf8')
      newItems.push(item.id)
    } else {
      const dest = safeJoin(CACHE_DIR, item.path)
      if (!dest) {
        warn(`Skipping ${item.id}: path traversal detected`)
        failed.push(item.id)
        continue
      }
      if (await fs.pathExists(dest)) {
        unchanged++
        continue
      }
      const url = `${REMOTE_BASE}/${item.path}`
      const text = await fetchText(url)
      if (!text) {
        warn(`Failed to fetch content for ${item.id}`)
        failed.push(item.id)
        continue
      }
      await fs.ensureDir(path.dirname(dest))
      await fs.writeFile(dest, text, 'utf8')
      newItems.push(item.id)
    }
  }

  return { newItems, unchanged, failed }
}

const CATALOG_TAGS_API_URL = 'https://api.github.com/repos/WeAreHausTech/haus-workflow-catalog/tags'

/**
 * Fetches the latest release tag from the catalog GitHub repo.
 * Returns null if the request fails or no tags exist.
 * Timeout: 5 seconds. Does not throw.
 */
export async function fetchLatestCatalogTag(): Promise<string | null> {
  // Skip in test environments to avoid network calls.
  if (process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  try {
    const res = await fetch(CATALOG_TAGS_API_URL, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const tags = (await res.json()) as Array<{ name: string }>
    return tags[0]?.name ?? null
  } catch {
    return null
  }
}

/** Returns milliseconds since the cache manifest was last written, or null if absent. */
export async function getCacheManifestAge(): Promise<number | null> {
  try {
    const stat = await fs.stat(path.join(CACHE_DIR, 'manifest.json'))
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}
