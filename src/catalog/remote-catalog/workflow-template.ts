/** Resolves the workflow standard template, cache-first with fetch-on-demand fallback. */
import path from 'node:path'

import fs from 'fs-extra'

import { fetchText, writeTextIfChanged } from './http.js'
import { getCacheDir, remoteBase } from './ref.js'

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
  }
  return text
}
