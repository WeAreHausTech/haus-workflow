/**
 * Writes .haus-workflow/WORKFLOW.md from the catalog-cached template.
 * Skips the write if the file was modified by the user or the content is already up to date.
 */

import fs from 'fs-extra'

import { readWorkflowTemplate } from '../catalog/remote-catalog.js'
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { hashText, writeText } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

import { normaliseLF, parseHausManagedHeader, SCHEMA_VERSION } from './managed-template.js'

/** Stable id embedded in the HAUS-MANAGED header — identifies this file on re-apply. */
const STABLE_ID = 'template.workflow'

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
  force = false,
): Promise<string | null> {
  // Resolve the workflow template from the catalog on demand (cached after first fetch),
  // so a fresh `haus init` can write WORKFLOW.md without a prior `haus update`. In dry-run
  // mode this does not write to the cache.
  const templateContent = await readWorkflowTemplate({ dryRun })
  if (templateContent === null) {
    warn(
      `Workflow template could not be fetched from the catalog — check your network, then re-run \`haus apply --write\` (or \`haus update\`)`,
    )
    return null
  }

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

    if (parsed.v !== undefined && parsed.v > SCHEMA_VERSION) {
      warn(
        `${printable}: written by a newer haus (template v${parsed.v}) — upgrade the CLI to manage it`,
      )
      return null
    }

    const existingContent = existing.slice(firstLine.length + 1)

    // Determine tamper status.
    // - parsed.hash present: we can verify cryptographically
    // - parsed.hash absent: header has id/v (haus-owned) but hash is missing or uses a
    //   legacy format that doesn't match the current sha256- regex. We cannot verify the
    //   body cryptographically, but we can check whether the body still matches the
    //   current template to distinguish "unchanged catalog content" from "user edit".
    const bodyMatchesTemplate = hashText(normaliseLF(existingContent)) === contentHash

    if (parsed.hash) {
      // Known hash format — standard tamper check
      const bodyIntact = hashText(normaliseLF(existingContent)) === parsed.hash
      if (!bodyIntact && !force) {
        warn(`${printable}: content modified by user — skipping. Use --force to overwrite.`)
        return null
      }
    } else {
      // No valid hash (missing field or legacy format).
      // Gate on body match: if the body still matches the current template it is safe to
      // rewrite (migrate the header to the current hash format). If the body has diverged
      // it may be a user edit — preserve the body but migrate the header so future runs
      // can verify correctly.
      if (!bodyMatchesTemplate && !force) {
        // Body differs and we can't verify — preserve body, migrate header only.
        const migratedHeader = makeWorkflowHeader(
          pkgVersion,
          hashText(normaliseLF(existingContent)),
        )
        const migrated = `${migratedHeader}\n${existingContent}`
        if (hasTextChanged(existing, migrated)) {
          if (dryRun) {
            log(`${printable}: migrating legacy hash header (body preserved)`)
          } else {
            await writeText(destPath, migrated)
          }
        } else if (dryRun) {
          log(`${printable}: unchanged`)
        }
        return destPath
      }
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
