/** Resolves which catalog git ref (tag or branch) to fetch from, and caches it per-process. */
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'
import { packageRoot } from '../../utils/paths.js'
import { CATALOG_CACHE_SUBDIR, CATALOG_REPO_URL } from '../constants.js'

/** True when running under test mode — only then is HAUS_CATALOG_REMOTE_BASE honoured. */
export function isTestMode(): boolean {
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
let inFlightCatalogRef: Promise<string> | undefined

/** Test-only: clears the module-level ref cache between isolated test runs. */
export function _resetRefCacheForTests(): void {
  cachedCatalogRef = undefined
  inFlightCatalogRef = undefined
}

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

/** Returns auth headers for the GitHub API, if a token is configured. */
export function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const auth = process.env['HAUS_GITHUB_TOKEN'] ?? process.env['GITHUB_TOKEN']
  if (auth) headers['Authorization'] = `Bearer ${auth}`
  return headers
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

/** Resolves the base URL to fetch catalog content from (honors HAUS_CATALOG_REMOTE_BASE in test mode). */
export async function remoteBase(): Promise<string> {
  // HAUS_CATALOG_REMOTE_BASE is only honoured in test mode (HAUS_TEST_MODE=1 or
  // NODE_ENV=test) to prevent a poisoned shell env from redirecting the supply
  // chain to an attacker-controlled server in production builds.
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    return process.env['HAUS_CATALOG_REMOTE_BASE']
  }
  if (cachedCatalogRef === undefined) {
    if (!inFlightCatalogRef) {
      inFlightCatalogRef = resolveCatalogRef({ fallbackRef: getBundledCatalogRef() }).then(
        (ref) => {
          cachedCatalogRef = ref
          return ref
        },
      )
    }
    await inFlightCatalogRef
  }
  return `${CATALOG_REPO_URL}/${cachedCatalogRef}`
}
