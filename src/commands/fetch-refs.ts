/** `haus fetch-refs` — fetches and caches llms.txt content from catalog item references. */
import { loadCatalog } from '../catalog/load-catalog.js'
import { fetchRefsForItems, isLlmsTxtUrl } from '../refs/fetch-refs.js'
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

  // Intentionally catalog-wide (unlike `apply`'s auto-fetch step, which scopes to
  // installed items and prunes orphans) — this command exists to let a user explicitly
  // pre-fetch or inspect any catalog item's llms.txt, regardless of install state.
  const withRefs = items.filter((item) => (item.references ?? []).some(isLlmsTxtUrl))

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
    log(`Cached: ${filePath} (${url})`)
  }
  if (summary.fetched > 0) log(`Fetched: ${summary.fetched} URL(s)`)
  if (summary.unchanged > 0) log(`Unchanged (etag match): ${summary.unchanged} URL(s)`)
  if (summary.failed > 0) {
    warn(`Failed to fetch ${summary.failed} URL(s): ${summary.failedUrls.join(', ')}`)
  }
  if (summary.fetched === 0 && summary.unchanged > 0 && summary.failed === 0) {
    log('All references up to date.')
  }
}
