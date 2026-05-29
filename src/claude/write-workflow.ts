/**
 * Writes .haus-workflow/WORKFLOW.md from the bundled (or cached) template.
 * Skips the write if the file was modified by the user or the content is already up to date.
 */

import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import { CATALOG_CACHE_SUBDIR } from '../catalog/constants.js'
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { hashText, writeText } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { displayPath, hausPath, packageRoot } from '../utils/paths.js'

import { normaliseLF, parseHausManagedHeader } from './managed-template.js'

/** Stable id embedded in the HAUS-MANAGED header — identifies this file on re-apply. */
const STABLE_ID = 'template.workflow'
const SCHEMA_VERSION = '1'
const TEMPLATE_REL = 'library/global/templates/agentic-workflow-standard.md'
const CATALOG_CACHE_TEMPLATE = path.join(
  os.homedir(),
  CATALOG_CACHE_SUBDIR,
  'templates/agentic-workflow-standard.md',
)

/** Build the HAUS-MANAGED header line, embedding the content hash for tamper detection. */
export function makeWorkflowHeader(pkgVersion: string, contentHash: string): string {
  return `<!-- HAUS-MANAGED id=${STABLE_ID} v=${SCHEMA_VERSION} source=@haus-tech/haus-workflow@${pkgVersion} hash=${contentHash} -->`
}

/**
 * Write .haus-workflow/WORKFLOW.md at `root`.
 * Returns null (and warns) when the template is missing or the file was user-modified.
 */
export async function writeWorkflow(
  root: string,
  pkgVersion: string,
  dryRun: boolean,
): Promise<string | null> {
  // Catalog cache (populated by `haus update`) takes precedence over bundled fallback
  const cachePath = CATALOG_CACHE_TEMPLATE
  const packagePath = path.join(packageRoot(), TEMPLATE_REL)
  const templatePath = (await fs.pathExists(cachePath)) ? cachePath : packagePath

  if (!(await fs.pathExists(templatePath))) {
    warn(`Workflow template not found — run \`haus update\` to fetch from catalog`)
    return null
  }

  const templateContent = await fs.readFile(templatePath, 'utf8')
  const contentHash = hashText(normaliseLF(templateContent))
  const header = makeWorkflowHeader(pkgVersion, contentHash)
  const next = `${header}\n${templateContent}`

  const destPath = hausPath(root, 'WORKFLOW.md')
  const printable = displayPath(root, destPath)

  if (await fs.pathExists(destPath)) {
    const existing = await fs.readFile(destPath, 'utf8')
    const firstLine = existing.split('\n')[0] ?? ''
    const parsed = parseHausManagedHeader(firstLine)

    if (!parsed) {
      warn(`${printable}: no HAUS-MANAGED header — file appears user-owned, skipping`)
      return null
    }

    if (parsed.id !== STABLE_ID) {
      warn(`${printable}: HAUS-MANAGED id mismatch (expected ${STABLE_ID}) — skipping`)
      return null
    }

    const existingContent = existing.slice(firstLine.length + 1)
    if (parsed.hash && hashText(normaliseLF(existingContent)) !== parsed.hash) {
      warn(`${printable}: content modified by user — skipping. Use --force to overwrite.`)
      return null
    }

    if (!hasTextChanged(existing, next)) {
      if (dryRun) log(`${printable}: unchanged`)
      return destPath
    }
  }

  if (dryRun) {
    const prev = (await fs.pathExists(destPath)) ? await fs.readFile(destPath, 'utf8') : ''
    if (!prev) {
      log(createUnifiedDiff(printable, '', next))
    } else {
      const diffText = createUnifiedDiff(printable, prev, next)
      const summary = summarizeDiff(diffText)
      log(`${printable}: would update (diff +${summary.additions} -${summary.deletions})`)
    }
    return destPath
  }

  await writeText(destPath, next)
  return destPath
}
