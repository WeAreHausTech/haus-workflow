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

const IMPORT_CONTENT = `@.haus-workflow/WORKFLOW.md\n@.haus-workflow/workflow-config.md\n@docs/decisions/README.md`

/** Build the full managed import block (sentinels + @-import lines). */
export function buildImportBlock(): string {
  return `${BLOCK_BEGIN}\n${IMPORT_CONTENT}\n${BLOCK_END}`
}

type BlockRange = {
  beginStart: number
  beginEnd: number
  endStart: number
  endEnd: number
}

function findLineMarker(
  content: string,
  marker: string,
  from = 0,
): { start: number; end: number } | null {
  let idx = content.indexOf(marker, from)
  while (idx !== -1) {
    const lineStart = idx === 0 || content[idx - 1] === '\n'
    const after = idx + marker.length
    const lineEnd = after === content.length || content[after] === '\n' || content[after] === '\r'
    if (lineStart && lineEnd) return { start: idx, end: after }
    idx = content.indexOf(marker, idx + marker.length)
  }
  return null
}

function findImportBlockRange(content: string): BlockRange | null {
  const begin = findLineMarker(content, BLOCK_BEGIN)
  if (!begin) return null
  const end = findLineMarker(content, BLOCK_END, begin.end)
  if (!end) return null
  return { beginStart: begin.start, beginEnd: begin.end, endStart: end.start, endEnd: end.end }
}

/**
 * Replace the existing haus block in `existing`, or append `block` if none is present.
 * User content outside the sentinels is always preserved.
 */
/** Removes the managed haus import block from CLAUDE.md, preserving surrounding user content. */
export function stripHausBlock(existing: string): string {
  const range = findImportBlockRange(existing)
  if (!range) return existing
  const before = existing.slice(0, range.beginStart)
  const after = existing.slice(range.endEnd)
  const merged = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trimEnd()
  return merged.length > 0 ? `${merged}\n` : ''
}

export function injectHausBlock(existing: string, block: string): string {
  const range = findImportBlockRange(existing)
  if (range) {
    const before = existing.slice(0, range.beginStart)
    const after = existing.slice(range.endEnd)
    return `${before}${block}${after}`
  }

  // Malformed prior file (BEGIN present but END missing): replace trailing broken block.
  const loneBegin = findLineMarker(existing, BLOCK_BEGIN)
  if (loneBegin) {
    const before = existing.slice(0, loneBegin.start).trimEnd()
    if (before.length === 0) return `${block}\n`
    return `${before}\n\n${block}\n`
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
