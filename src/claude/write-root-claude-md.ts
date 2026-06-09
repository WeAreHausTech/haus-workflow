/**
 * Manages the root CLAUDE.md file: injects (or updates) the haus import block
 * that pulls in the workflow methodology + config without clobbering user content.
 * Deep project documentation is owned by the writing-documentation skill (docs/),
 * loaded on demand — not @-imported here, to keep per-session context lean.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { writeManagedText } from './managed-write.js'

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
/** Removes the managed haus import block from CLAUDE.md, preserving surrounding user content. */
export function stripHausBlock(existing: string): string {
  const beginIdx = existing.indexOf(BLOCK_BEGIN)
  if (beginIdx === -1) return existing
  const endIdx = existing.indexOf(BLOCK_END, beginIdx + BLOCK_BEGIN.length)
  if (endIdx === -1) return existing
  const before = existing.slice(0, beginIdx)
  const after = existing.slice(endIdx + BLOCK_END.length)
  const merged = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trimEnd()
  return merged.length > 0 ? `${merged}\n` : ''
}

export function injectHausBlock(existing: string, block: string): string {
  const beginIdx = existing.indexOf(BLOCK_BEGIN)
  const endIdx = beginIdx === -1 ? -1 : existing.indexOf(BLOCK_END, beginIdx + BLOCK_BEGIN.length)

  if (beginIdx !== -1 && endIdx !== -1) {
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

  await writeManagedText(root, filePath, next, dryRun)
  return filePath
}
