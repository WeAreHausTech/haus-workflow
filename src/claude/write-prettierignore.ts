/**
 * Manages a `.prettierignore` block that excludes haus-owned output from the
 * project formatter.
 *
 * Why this exists: `.haus-workflow/WORKFLOW.md` carries a content hash inside its
 * HAUS-MANAGED header for tamper detection. If the project's prettier (run by the
 * shipped lefthook `format` step, an editor's format-on-save, or a manual CLI run)
 * reformats that file, the body no longer matches the embedded hash and `haus doctor`
 * reports a phantom "modified locally" edit the user never made. prettier honours
 * `.prettierignore` on every invocation route, so excluding `.haus-workflow/` keeps
 * the managed files byte-stable. The block is sentinel-delimited so user entries are
 * never clobbered (mirrors the CLAUDE.md import block, ADR-0006 style).
 */

import path from 'node:path'

import fs from 'fs-extra'

import { writeManagedText } from './managed-write.js'

/** Opening sentinel for the managed block (a comment line in .prettierignore syntax). */
export const PRETTIERIGNORE_BEGIN = '# HAUS:BEGIN haus-managed v=1'
/** Closing sentinel for the managed block. */
export const PRETTIERIGNORE_END = '# HAUS:END haus-managed'

/** Paths haus owns and the formatter must leave untouched (keeps tamper hashes stable). */
const IGNORED_PATHS = ['.haus-workflow/']

/** Build the full managed block (sentinels + explanatory comment + ignored paths). */
export function buildPrettierIgnoreBlock(): string {
  return [
    PRETTIERIGNORE_BEGIN,
    '# haus-owned files — do not reformat (keeps tamper-detection hashes stable)',
    ...IGNORED_PATHS,
    PRETTIERIGNORE_END,
  ].join('\n')
}

/** Locate `marker` as a full line in `content`; returns its char range or null. */
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

/** Char range of the full managed block (BEGIN..END), or null if absent/unterminated. */
function findBlockRange(content: string): { start: number; end: number } | null {
  const begin = findLineMarker(content, PRETTIERIGNORE_BEGIN)
  if (!begin) return null
  const end = findLineMarker(content, PRETTIERIGNORE_END, begin.end)
  if (!end) return null
  return { start: begin.start, end: end.end }
}

/**
 * Replace the existing managed block in `existing`, or append `block` when none is
 * present. User content outside the sentinels is always preserved. The result ends
 * with a single trailing newline.
 */
export function injectPrettierIgnoreBlock(existing: string, block: string): string {
  const range = findBlockRange(existing)
  if (range) {
    const before = existing.slice(0, range.start)
    const after = existing.slice(range.end)
    return `${before}${block}${after}`.replace(/\n*$/, '\n')
  }

  // Malformed prior file (BEGIN present but END missing): replace trailing broken block.
  const loneBegin = findLineMarker(existing, PRETTIERIGNORE_BEGIN)
  if (loneBegin) {
    const before = existing.slice(0, loneBegin.start).trimEnd()
    if (before.length === 0) return `${block}\n`
    return `${before}\n\n${block}\n`
  }

  const trimmed = existing.trimEnd()
  if (trimmed.length === 0) return `${block}\n`
  return `${trimmed}\n\n${block}\n`
}

/** Remove the managed block from `existing`, preserving surrounding user content. */
export function stripPrettierIgnoreBlock(existing: string): string {
  const range = findBlockRange(existing)
  if (!range) return existing
  const before = existing.slice(0, range.start)
  const after = existing.slice(range.end)
  const merged = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trimEnd()
  return merged.length > 0 ? `${merged}\n` : ''
}

/**
 * Write `.prettierignore` at `root`, injecting (or refreshing) the haus managed block.
 * Returns the absolute path of the file.
 */
export async function writePrettierIgnore(root: string, dryRun: boolean): Promise<string> {
  const filePath = path.join(root, '.prettierignore')
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : ''
  const next = injectPrettierIgnoreBlock(prev, buildPrettierIgnoreBlock())
  await writeManagedText(root, filePath, next, dryRun)
  return filePath
}
