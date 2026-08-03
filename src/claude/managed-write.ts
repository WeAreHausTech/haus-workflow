/**
 * Shared "write only when content changed, diff-first in dry-run" helpers for
 * haus-managed files. Centralises the diff/log/write dance so every writer
 * (CLAUDE.md, lockfile, generated primitives) reports changes identically.
 */

import fs from 'fs-extra'

import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { writeText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath } from '../utils/paths.js'

/**
 * Write a text file, but skip the actual write when it already exists with identical
 * content — avoids unnecessary mtime churn for anything watching these files. In
 * dry-run mode, nothing is written; a diff (or an "unchanged" note) is logged instead.
 */
export async function writeManagedText(
  root: string,
  filePath: string,
  nextText: string,
  dryRun: boolean,
): Promise<void> {
  const existed = await fs.pathExists(filePath)
  const prev = existed ? await fs.readFile(filePath, 'utf8') : ''
  const printable = displayPath(root, filePath)
  if (dryRun) {
    if (!existed) {
      log(createUnifiedDiff(printable, '', nextText))
    } else if (hasTextChanged(prev, nextText)) {
      log(createUnifiedDiff(printable, prev, nextText))
    } else {
      log(`${printable}: unchanged`)
    }
    return
  }
  if (!existed || hasTextChanged(prev, nextText)) {
    if (existed) {
      const diffText = createUnifiedDiff(printable, prev, nextText)
      const summary = summarizeDiff(diffText)
      log(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`)
    }
    await writeText(filePath, nextText)
  }
}

/** Serialize `value` to pretty-printed JSON then delegate to `writeManagedText`. */
export async function writeManagedJson(
  root: string,
  filePath: string,
  value: unknown,
  dryRun: boolean,
): Promise<void> {
  const nextText = `${JSON.stringify(value, null, 2)}\n`
  await writeManagedText(root, filePath, nextText, dryRun)
}
