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

/** Write a text file only when content has changed; in dry-run mode, log the diff instead. */
export async function writeManagedText(
  root: string,
  filePath: string,
  nextText: string,
  dryRun: boolean,
): Promise<void> {
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : ''
  const printable = displayPath(root, filePath)
  if (dryRun) {
    if (!prev) {
      log(createUnifiedDiff(printable, '', nextText))
    } else if (hasTextChanged(prev, nextText)) {
      log(createUnifiedDiff(printable, prev, nextText))
    } else {
      log(`${printable}: unchanged`)
    }
    return
  }
  if (hasTextChanged(prev, nextText) && prev.length > 0) {
    const diffText = createUnifiedDiff(printable, prev, nextText)
    const summary = summarizeDiff(diffText)
    log(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`)
  }
  await writeText(filePath, nextText)
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
