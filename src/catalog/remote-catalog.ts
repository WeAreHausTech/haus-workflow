/**
 * Fetches the catalog manifest from the remote haus-workflow-catalog repo via git tag.
 * Caches downloaded content under ~/.claude/haus/catalog-cache/ (overridable in tests).
 */

import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../types.js'
import { mapWithConcurrency } from '../utils/fs.js'
import { warn } from '../utils/logger.js'

import { CATALOG_CACHE_SUBDIR, CATALOG_REPO_URL } from './constants.js'
import { validateCatalogItem } from './ingest-catalog.js'
import { parseManifest } from './manifest-schema.js'

// HAUS_CATALOG_CACHE_DIR_OVERRIDE redirects cache writes/reads for isolated tests.
/** Resolves the catalog cache directory (per call so tests can override env after import). */
export function getCacheDir(): string {
  return (
    process.env['HAUS_CATALOG_CACHE_DIR_OVERRIDE'] ?? path.join(os.homedir(), CATALOG_CACHE_SUBDIR)
  )
}

let cachedCatalogRef: string | undefined

/** Latest resolved catalog ref for this process (informational / lock metadata). */
export function getResolvedCatalogRef(): string {
  return cachedCatalogRef ?? process.env['HAUS_CATALOG_REF'] ?? 'main'
}

/** True after sync or when HAUS_CATALOG_REF is set (not the unsynced `main` fallback). */
export function isCatalogRefResolved(): boolean {
  return cachedCatalogRef !== undefined || process.env['HAUS_CATALOG_REF'] !== undefined
}

/**
 * Resolve which git ref to fetch the catalog from.
 * Honors HAUS_CATALOG_REF; else latest release tag; else `main`.
 */
export async function resolveCatalogRef(opts?: {
  env?: NodeJS.ProcessEnv
  fetchLatestTag?: () => Promise<string | null>
}): Promise<string> {
  const env = opts?.env ?? process.env
  if (env['HAUS_CATALOG_REF']) return env['HAUS_CATALOG_REF']
  const fetchLatest = opts?.fetchLatestTag ?? fetchLatestCatalogTag
  const tag = await fetchLatest()
  return tag ?? 'main'
}

async function remoteBase(): Promise<string> {
  if (process.env['HAUS_CATALOG_REMOTE_BASE']) {
    return process.env['HAUS_CATALOG_REMOTE_BASE']
  }
  if (cachedCatalogRef === undefined) {
    cachedCatalogRef = await resolveCatalogRef()
  }
  return `${CATALOG_REPO_URL}/${cachedCatalogRef}`
}

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

/** Downloads and schema-validates the remote manifest; returns null if fetch or validation fails. */
export async function fetchRemoteManifest(): Promise<{
  version: string
  items: CatalogItem[]
} | null> {
  const base = await remoteBase()
  const text = await fetchText(`${base}/manifest.json`)
  if (!text) return null
  const parsed = parseManifest(text)
  if (!parsed.ok) {
    warn(`Remote manifest failed schema validation: ${parsed.error}`)
    return null
  }
  if (!parsed.manifest.items.length) return null
  return parsed.manifest
}

type WriteOutcome = 'created' | 'updated' | 'unchanged'

/** Writes `text` to `dest` when missing or content differs; creates parent dirs on write. */
async function writeTextIfChanged(dest: string, text: string): Promise<WriteOutcome> {
  if (await fs.pathExists(dest)) {
    const local = await fs.readFile(dest, 'utf8')
    if (local === text) return 'unchanged'
    await fs.writeFile(dest, text, 'utf8')
    return 'updated'
  }
  await fs.ensureDir(path.dirname(dest))
  await fs.writeFile(dest, text, 'utf8')
  return 'created'
}

/** Relative path of the workflow standard template within the catalog. */
export const WORKFLOW_TEMPLATE_REL = 'templates/agentic-workflow-standard.md'

/**
 * Resolves the workflow standard template content, using the cache when present and
 * otherwise fetching it from the remote catalog on demand. Returns the content, or null
 * when it cannot be obtained (e.g. offline with no prior cache). Lets `haus init` write
 * WORKFLOW.md on a fresh install without a separate `haus update` step.
 *
 * Distinguishes a failed fetch (null) from a successful empty body (''), and honours the
 * dry-run contract: when `dryRun` is set, a freshly fetched template is NOT written to
 * the cache (no filesystem side effects during a preview).
 */
export async function readWorkflowTemplate(
  opts: { dryRun?: boolean } = {},
): Promise<string | null> {
  const dest = path.join(getCacheDir(), WORKFLOW_TEMPLATE_REL)
  const base = await remoteBase()
  const text = await fetchText(`${base}/${WORKFLOW_TEMPLATE_REL}`)
  if (text === null) {
    if (await fs.pathExists(dest)) return fs.readFile(dest, 'utf8')
    return null
  }
  if (!opts.dryRun) {
    await writeTextIfChanged(dest, text)
  } else if (await fs.pathExists(dest)) {
    return fs.readFile(dest, 'utf8')
  }
  return text
}

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

const KNOWN_ITEM_TYPES = new Set(['skill', 'agent', 'template', 'command'])

/** True for a reference entry that points at an external resource rather than a bundled file. */
function isExternalReference(ref: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(ref)
}

/**
 * Downloads a skill's nested reference files (e.g. `references/conventions.md`) into the
 * cache alongside its SKILL.md. External URL references are skipped. Idempotent: only
 * fetches files that are not already cached, so it safely backfills older partial caches.
 */
async function downloadSkillReferences(
  item: CatalogItem,
  destDir: string,
  base: string,
): Promise<void> {
  for (const ref of item.references ?? []) {
    if (isExternalReference(ref)) continue
    const refDest = safeJoin(destDir, ref)
    if (!refDest) {
      warn(`Skipping reference "${ref}" for ${item.id}: path traversal detected`)
      continue
    }
    const text = await fetchText(`${base}/${item.path}/${ref}`)
    if (text === null) {
      warn(`Failed to fetch reference "${ref}" for ${item.id}`)
      continue
    }
    await writeTextIfChanged(refDest, text)
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
    const destDir = safeJoin(getCacheDir(), item.path)
    if (!destDir) {
      warn(`Skipping ${item.id}: path traversal detected`)
      return 'failed'
    }
    const dest = path.join(destDir, 'SKILL.md')
    const text = await fetchText(`${base}/${item.path}/SKILL.md`)
    if (!text) {
      warn(`Failed to fetch content for ${item.id}`)
      return 'failed'
    }
    const verdict = validateCatalogItem(item, text)
    if (!verdict.ok) {
      warn(`Rejected ${item.id} at ingest: ${verdict.reason}`)
      return 'failed'
    }
    try {
      const outcome = await writeTextIfChanged(dest, text)
      await downloadSkillReferences(item, destDir, base)
      return outcome
    } catch (err) {
      warn(`Failed to cache ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      return 'failed'
    }
  }

  const dest = safeJoin(getCacheDir(), item.path)
  if (!dest) {
    warn(`Skipping ${item.id}: path traversal detected`)
    return 'failed'
  }
  const text = await fetchText(`${base}/${item.path}`)
  if (!text) {
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
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const outcome = outcomes[i]
    if (outcome === 'created') newItems.push(item.id)
    else if (outcome === 'updated') refreshed.push(item.id)
    else if (outcome === 'unchanged') unchanged++
    else if (outcome === 'failed') failed.push(item.id)
  }

  return { newItems, refreshed, unchanged, failed }
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
    const stat = await fs.stat(path.join(getCacheDir(), 'manifest.json'))
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}
