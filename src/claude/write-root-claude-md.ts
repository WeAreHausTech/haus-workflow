/**
 * Manages the root CLAUDE.md file: injects (or updates) the haus import block
 * that pulls in the workflow methodology + config without clobbering user content.
 * Deep project documentation is owned by the writing-documentation skill (docs/),
 * loaded on demand — not @-imported here, to keep per-session context lean.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { writeText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath } from '../utils/paths.js'

/** Opening sentinel for the managed import block inside CLAUDE.md. */
export const BLOCK_BEGIN = '<!-- HAUS:BEGIN haus-imports v=1 -->'
/** Closing sentinel for the managed import block inside CLAUDE.md. */
export const BLOCK_END = '<!-- HAUS:END haus-imports -->'

const IMPORT_CONTENT = `@.haus-workflow/WORKFLOW.md\n@.haus-workflow/workflow-config.md`

/** Build the full managed import block (sentinels + @-import lines). */
export function buildImportBlock(): string {
  return `${BLOCK_BEGIN}\n${IMPORT_CONTENT}\n${BLOCK_END}`
}

/**
 * Replace the existing haus block in `existing`, or append `block` if none is present.
 * User content outside the sentinels is always preserved.
 */
export function injectHausBlock(existing: string, block: string): string {
  const beginIdx = existing.indexOf(BLOCK_BEGIN)
  const endIdx = existing.indexOf(BLOCK_END)

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx)
    const after = existing.slice(endIdx + BLOCK_END.length)
    return `${before}${block}${after}`
  }

  const trimmed = existing.trimEnd()
  if (trimmed.length === 0) {
    return `${block}\n`
  }
  return `${trimmed}\n\n${block}\n`
}

/**
 * Write the root CLAUDE.md at `root`, injecting (or refreshing) the haus import block.
 * Returns the absolute path of CLAUDE.md.
 */
export async function writeRootClaudeMd(root: string, dryRun: boolean): Promise<string> {
  const filePath = path.join(root, 'CLAUDE.md')
  const block = buildImportBlock()
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : ''
  const next = injectHausBlock(prev, block)
  const printable = displayPath(root, filePath)

  if (dryRun) {
    if (!prev) {
      log(createUnifiedDiff(printable, '', next))
    } else if (hasTextChanged(prev, next)) {
      log(createUnifiedDiff(printable, prev, next))
    } else {
      log(`${printable}: unchanged`)
    }
    return filePath
  }

  if (hasTextChanged(prev, next) && prev.length > 0) {
    const diffText = createUnifiedDiff(printable, prev, next)
    const summary = summarizeDiff(diffText)
    log(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`)
  }

  await writeText(filePath, next)
  return filePath
}
