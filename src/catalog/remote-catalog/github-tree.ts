/** GitHub tree-listing helpers: resolves which files exist under a catalog prefix. */
import path from 'node:path'

import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'
import { CATALOG_GITHUB_API_URL } from '../constants.js'
import { isSafeRelativeFilePath } from '../path-safety.js'

import { getGithubApiHeaders } from './github-auth.js'
import { isGithubRateLimitedResponse, noteGithubRateLimit } from './github-rate-limit.js'
import { fetchText } from './http.js'
import { getResolvedCatalogRef, isTestMode } from './ref.js'

let cachedBlobPaths: string[] | undefined
let inFlightBlobPaths: Promise<string[] | null> | undefined
/** When true, further tree fetches are skipped for this sync (rate-limit negative cache). */
let treeListingBlocked = false

/** Drop unsafe entries; returns null when any path in the listing is rejected. */
function sanitizeRelativeFilePaths(files: string[], label: string): string[] | null {
  const safe: string[] = []
  for (const rel of files) {
    if (!isSafeRelativeFilePath(rel)) {
      warn(`Rejected unsafe path in ${label}: ${rel}`)
      return null
    }
    safe.push(rel)
  }
  return safe
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    if (!(await fs.pathExists(dir))) return out
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)))
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).replace(/\\/g, '/'))
    }
  }
  return out.sort()
}

/** Mock test hook: GET {base}/__haus_tree__/{prefix} → JSON string[] of paths relative to prefix. */
async function listMockPrefixFiles(base: string, prefix: string): Promise<string[] | null> {
  const text = await fetchText(`${base}/__haus_tree__/${encodeURIComponent(prefix)}`)
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed) || !parsed.every((e) => typeof e === 'string')) return null
    return parsed as string[]
  } catch {
    return null
  }
}

async function fetchGitHubRecursiveBlobPaths(ref: string): Promise<string[] | null> {
  try {
    const headers = await getGithubApiHeaders()
    const authenticated = Boolean(headers['Authorization'])
    const commitRes = await fetch(`${CATALOG_GITHUB_API_URL}/commits/${encodeURIComponent(ref)}`, {
      signal: AbortSignal.timeout(15_000),
      headers,
    })
    if (!commitRes.ok) {
      if (isGithubRateLimitedResponse(commitRes)) {
        noteGithubRateLimit(commitRes, authenticated)
        treeListingBlocked = true
      }
      return null
    }
    const commit = (await commitRes.json()) as { commit: { tree: { sha: string } } }
    const treeSha = commit.commit.tree.sha
    const treeRes = await fetch(`${CATALOG_GITHUB_API_URL}/git/trees/${treeSha}?recursive=1`, {
      signal: AbortSignal.timeout(30_000),
      headers,
    })
    if (!treeRes.ok) {
      if (isGithubRateLimitedResponse(treeRes)) {
        noteGithubRateLimit(treeRes, authenticated)
        treeListingBlocked = true
      }
      return null
    }
    const tree = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string }>
      truncated?: boolean
    }
    if (tree.truncated) {
      warn('Catalog GitHub tree listing was truncated — refusing partial cache sync')
      return null
    }
    return tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)
  } catch {
    return null
  }
}

/** All blob paths in the catalog repo at the resolved ref (cached per sync). */
export async function fetchCatalogBlobPaths(_base: string): Promise<string[] | null> {
  if (treeListingBlocked) return null
  if (cachedBlobPaths) return cachedBlobPaths
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  if (!inFlightBlobPaths) {
    inFlightBlobPaths = (async () => {
      const ref = getResolvedCatalogRef()
      const paths = await fetchGitHubRecursiveBlobPaths(ref)
      if (paths) cachedBlobPaths = paths
      inFlightBlobPaths = undefined
      return paths
    })()
  }
  return inFlightBlobPaths
}

/** File paths relative to `prefix` (e.g. SKILL.md, references/foo.md). */
export async function listFilesUnderCatalogPrefix(
  prefix: string,
  base: string,
): Promise<string[] | null> {
  const normalized = prefix.replace(/\\/g, '/').replace(/\/+$/, '')
  const prefixSlash = `${normalized}/`

  let relFiles: string[] | null
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    relFiles = await listMockPrefixFiles(base, normalized)
  } else {
    const blobs = await fetchCatalogBlobPaths(base)
    if (!blobs) return null
    relFiles = blobs
      .filter((p) => p.startsWith(prefixSlash))
      .map((p) => p.slice(prefixSlash.length))
      .sort()
  }
  if (!relFiles) return null
  return sanitizeRelativeFilePaths(relFiles, normalized)
}

/** Test-only: clears the module-level blob-path cache between isolated test runs. */
export function _resetBlobPathCacheForTests(): void {
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
  treeListingBlocked = false
}

/** Resets the per-sync blob-path cache at the start of a fresh `syncRemoteCatalog` run. */
export function _resetBlobPathCacheForNewSync(): void {
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
  treeListingBlocked = false
}

export { listFilesRecursive }
