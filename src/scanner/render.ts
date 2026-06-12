/** Rendering + content-index helpers for the scanner. */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { mapWithConcurrency } from '../utils/fs.js'

/**
 * Builds a single content blob from the first 300 candidate files (code/config
 * extensions), read ONCE. The registry's `content` signals search this blob instead of
 * re-reading every file per needle. The 300-file cap keeps scan time predictable on
 * large monorepos; files are joined with newlines so no needle matches across a boundary.
 *
 * @param root - Absolute project root.
 * @param files - Full safe file list; filtered internally to code/config extensions.
 */
export async function buildContentBlob(root: string, files: string[]): Promise<string> {
  const candidates = files.filter(
    (f) =>
      f.endsWith('.ts') ||
      f.endsWith('.js') ||
      f.endsWith('.php') ||
      f.endsWith('.json') ||
      f.endsWith('.yml') ||
      f.endsWith('.yaml'),
  )
  // Read in bounded batches rather than one big Promise.all — 300 concurrent opens can
  // exhaust file descriptors (EMFILE) on some systems; the bound keeps the one-pass win.
  const slice = candidates.slice(0, 300)
  const parts = await mapWithConcurrency(slice, async (rel) => {
    try {
      return await readFile(path.join(root, rel), 'utf8')
    } catch {
      // File may have been deleted or be unreadable — skip and continue.
      return ''
    }
  })
  return parts.join('\n')
}
