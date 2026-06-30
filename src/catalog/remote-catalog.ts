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
import { packageRoot } from '../utils/paths.js'

import {
  CATALOG_CACHE_SUBDIR,
  CATALOG_GITHUB_API_URL,
  CATALOG_REPO_URL,
  SUPERPOWERS_SHARED_CATALOG_REL,
} from './constants.js'
import { validateCatalogItem } from './ingest-catalog.js'
import { parseManifest } from './manifest-schema.js'

/** True when running under test mode — only then is HAUS_CATALOG_REMOTE_BASE honoured. */
function isTestMode(): boolean {
  return process.env['HAUS_TEST_MODE'] === '1' || process.env['NODE_ENV'] === 'test'
}

// HAUS_CATALOG_CACHE_DIR_OVERRIDE redirects cache writes/reads for isolated tests.
/** Resolves the catalog cache directory (per call so tests can override env after import). */
export function getCacheDir(): string {
  return (
    process.env['HAUS_CATALOG_CACHE_DIR_OVERRIDE'] ?? path.join(os.homedir(), CATALOG_CACHE_SUBDIR)
  )
}

let cachedCatalogRef: string | undefined
let cachedBlobPaths: string[] | undefined

/**
 * Returns the version tag from the bundled catalog snapshot (e.g. "v3.2.0").
 * Used as the last-resort fallback ref when tag resolution fails and no cached ref exists.
 * Returns undefined if the bundled manifest cannot be read.
 */
export function getBundledCatalogRef(): string | undefined {
  try {
    const manifestPath = path.join(packageRoot(), 'library/catalog/manifest.json')
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const data = JSON.parse(raw) as { version?: string }
    if (typeof data.version === 'string' && data.version) {
      // Normalize to a tag format: "3.2.0" → "v3.2.0", "v3.2.0" → "v3.2.0"
      return data.version.startsWith('v') ? data.version : `v${data.version}`
    }
  } catch {
    // bundled manifest unreadable — caller handles undefined
  }
  return undefined
}

/** Latest resolved catalog ref for this process (informational / lock metadata). */
export function getResolvedCatalogRef(): string {
  const resolved = cachedCatalogRef ?? process.env['HAUS_CATALOG_REF'] ?? getBundledCatalogRef()
  if (!resolved) {
    warn(
      'Could not determine catalog ref from cache, env, or bundled snapshot — falling back to main (moving target).',
    )
    return 'main'
  }
  return resolved
}

/** True after sync or when HAUS_CATALOG_REF is set (not the unsynced `main` fallback). */
export function isCatalogRefResolved(): boolean {
  return cachedCatalogRef !== undefined || process.env['HAUS_CATALOG_REF'] !== undefined
}

/**
 * Resolve which git ref to fetch the catalog from.
 * Honors HAUS_CATALOG_REF (warns when set to 'main' — it is a moving target).
 * Otherwise uses the latest release tag from GitHub.
 * When tag resolution fails (network error, timeout, rate-limit), falls back to
 * `fallbackRef` (a previously known good ref) rather than 'main'.
 * Only serves 'main' when HAUS_CATALOG_REF=main is explicitly set in env.
 */
export async function resolveCatalogRef(opts?: {
  env?: NodeJS.ProcessEnv
  fetchLatestTag?: () => Promise<string | null>
  /** Ref to use when tag resolution fails (e.g. cached lock ref or bundled snapshot ref). */
  fallbackRef?: string
}): Promise<string> {
  const env = opts?.env ?? process.env
  if (env['HAUS_CATALOG_REF']) {
    if (env['HAUS_CATALOG_REF'] === 'main') {
      warn(
        'HAUS_CATALOG_REF=main is set — fetching from the moving main branch. ' +
          'Pin to a release tag for reproducible installs.',
      )
    }
    return env['HAUS_CATALOG_REF']
  }
  const fetchLatest = opts?.fetchLatestTag ?? fetchLatestCatalogTag
  const tag = await fetchLatest()
  if (tag !== null) return tag
  // Tag resolution failed. Use the provided fallback ref instead of silently serving 'main'.
  const fallback = opts?.fallbackRef
  if (fallback) {
    warn(
      `Tag resolution failed — using cached ref ${fallback}. ` +
        'To use latest, retry or set HAUS_CATALOG_REF explicitly.',
    )
    return fallback
  }
  // Last resort: bundled snapshot ref. This avoids fetching unreviewed content from main.
  const bundled = getBundledCatalogRef()
  if (bundled) {
    warn(
      `Tag resolution failed — using bundled snapshot ref ${bundled}. ` +
        'To use latest, retry or set HAUS_CATALOG_REF explicitly.',
    )
    return bundled
  }
  // Absolute last resort — only reached when the bundled manifest is unreadable.
  warn(
    'Tag resolution failed and no fallback ref is available. ' +
      'Set HAUS_CATALOG_REF explicitly to avoid fetching from main.',
  )
  return 'main'
}

async function remoteBase(): Promise<string> {
  // HAUS_CATALOG_REMOTE_BASE is only honoured in test mode (HAUS_TEST_MODE=1 or
  // NODE_ENV=test) to prevent a poisoned shell env from redirecting the supply
  // chain to an attacker-controlled server in production builds.
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    return process.env['HAUS_CATALOG_REMOTE_BASE']
  }
  if (cachedCatalogRef === undefined) {
    cachedCatalogRef = await resolveCatalogRef({ fallbackRef: getBundledCatalogRef() })
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

/** Fetches raw bytes from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
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

/** Guards relative file paths from tree listings (untrusted) before joining under a dest dir. */
function isSafeRelativeFilePath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('//')) return false
  if (path.isAbsolute(rel)) return false
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'))
  return normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../')
}

function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const auth = process.env['HAUS_GITHUB_TOKEN'] ?? process.env['GITHUB_TOKEN']
  if (auth) headers['Authorization'] = `Bearer ${auth}`
  return headers
}

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

/** Resolves itemPath under base; returns null if the result escapes the base directory. */
function safeJoin(base: string, itemPath: string): string | null {
  if (!isSafeCatalogPath(itemPath)) return null
  const resolved = path.resolve(base, itemPath)
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null
}

const KNOWN_ITEM_TYPES = new Set(['skill', 'agent', 'template', 'command', 'config'])

function isMarkdownPath(rel: string): boolean {
  return rel.toLowerCase().endsWith('.md')
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
    const headers = githubApiHeaders()
    const commitRes = await fetch(`${CATALOG_GITHUB_API_URL}/commits/${encodeURIComponent(ref)}`, {
      signal: AbortSignal.timeout(15_000),
      headers,
    })
    if (!commitRes.ok) return null
    const commit = (await commitRes.json()) as { commit: { tree: { sha: string } } }
    const treeSha = commit.commit.tree.sha
    const treeRes = await fetch(`${CATALOG_GITHUB_API_URL}/git/trees/${treeSha}?recursive=1`, {
      signal: AbortSignal.timeout(30_000),
      headers,
    })
    if (!treeRes.ok) return null
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
  if (cachedBlobPaths) return cachedBlobPaths
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  const ref = getResolvedCatalogRef()
  const paths = await fetchGitHubRecursiveBlobPaths(ref)
  if (paths) cachedBlobPaths = paths
  return paths
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

type FetchedFile =
  | { rel: string; kind: 'text'; body: string }
  | { rel: string; kind: 'binary'; body: Buffer }

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
    warn(`Failed to list files for ${item.id}`)
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
  cachedBlobPaths = undefined

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
  if (sharedOutcome === 'failed') {
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

  return { newItems, refreshed, unchanged, failed }
}

const CATALOG_TAGS_API_URL = 'https://api.github.com/repos/WeAreHausTech/haus-workflow-catalog/tags'

function parseSemverTag(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * Fetches the latest release tag from the catalog GitHub repo.
 * Returns null if the request fails or no tags exist.
 * Timeout: 5 seconds. Does not throw.
 */
export async function fetchLatestCatalogTag(): Promise<string | null> {
  // Skip in test environments to avoid network calls.
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  try {
    const res = await fetch(CATALOG_TAGS_API_URL, {
      signal: AbortSignal.timeout(5_000),
      headers: githubApiHeaders(),
    })
    if (!res.ok) return null
    const tags = (await res.json()) as Array<{ name?: string }>
    const valid = tags
      .map((tag) => {
        const name = typeof tag.name === 'string' ? tag.name : ''
        const semver = parseSemverTag(name)
        return semver ? { name, semver } : null
      })
      .filter(
        (entry): entry is { name: string; semver: [number, number, number] } => entry !== null,
      )
    if (valid.length === 0) return null
    valid.sort((a, b) => compareSemver(b.semver, a.semver))
    return valid[0]!.name
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
