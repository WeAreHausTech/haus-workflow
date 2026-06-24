/**
 * Removes previously installed catalog items from ~/.claude/ using the manifest to
 * locate haus-owned files, and strips haus hook entries from settings.json.
 */
import crypto from 'node:crypto'
import path from 'node:path'

import fs from 'fs-extra'

import { pruneEmptyDir, readText } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'

import { parseMarkdownHeader } from './header.js'
import { globalClaudeDir, hausManifestPath, readManifest } from './manifest.js'
import {
  readSettings,
  stripHausAllow,
  stripHausAsk,
  stripHausDeny,
  stripHausHooks,
  writeSettings,
} from './settings-merge.js'

/** Options controlling how `runUninstall` behaves. */
export interface UninstallOptions {
  /** Delete user-edited haus files even when hash doesn't match the manifest. */
  force?: boolean
}

/** Summary of files deleted or skipped during an uninstall. */
export interface UninstallResult {
  deleted: string[]
  skipped: string[]
  /** True when haus hook entries were removed from settings.json. */
  hooksStripped: boolean
}

/**
 * Deletes all haus-managed files tracked in the manifest, strips hooks from settings.json,
 * and removes the manifest file itself. Skips user-owned or user-edited files unless `force`.
 */
export async function runUninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
  const { force = false } = options
  const manifest = await readManifest()

  const result: UninstallResult = { deleted: [], skipped: [], hooksStripped: false }

  if (!manifest) {
    warn('No install manifest found — nothing to uninstall.')
    return result
  }

  for (const entry of manifest.files) {
    const exists = fs.pathExistsSync(entry.destPath)
    if (!exists) continue

    const content = await readText(entry.destPath)
    if (content === undefined) continue

    const header = parseMarkdownHeader(content)
    if (!header) {
      warn(`Skipping user-owned file (no HAUS-MANAGED header): ${entry.destPath}`)
      result.skipped.push(entry.destPath)
      continue
    }

    const currentHash = `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`
    if (currentHash !== entry.hash && !force) {
      warn(
        `Skipping user-edited haus file (hash mismatch): ${entry.destPath} — use --force to delete`,
      )
      result.skipped.push(entry.destPath)
      continue
    }

    await fs.remove(entry.destPath)
    await pruneEmptyDir(path.dirname(entry.destPath))
    result.deleted.push(entry.destPath)
  }

  const settings = await readSettings()
  // Strip allow + deny + ask rules first (each keeps _haus if other tracking remains),
  // then hooks last (deletes the _haus namespace).
  const stripped = stripHausHooks(stripHausAsk(stripHausAllow(stripHausDeny(settings))))
  await writeSettings(stripped)
  result.hooksStripped = true

  const hausDir = path.join(globalClaudeDir(), 'haus')
  const manifestPath = hausManifestPath()
  if (fs.pathExistsSync(manifestPath)) {
    await fs.remove(manifestPath)
  }
  if (fs.pathExistsSync(hausDir)) {
    try {
      const remaining = await fs.readdir(hausDir)
      if (remaining.length === 0) await fs.remove(hausDir)
    } catch {
      // Leave directory in place if unreadable
    }
  }

  return result
}

/** Prints a human-readable uninstall summary to the logger. */
export function printUninstallResult(result: UninstallResult): void {
  if (result.deleted.length) {
    log('Deleted:')
    result.deleted.forEach((p) => log(`  - ${p}`))
  }
  if (result.skipped.length) {
    log('Skipped (user-owned or mismatch):')
    result.skipped.forEach((p) => log(`  ! ${p}`))
  }
  if (result.hooksStripped) {
    log('Haus hook entries removed from ~/.claude/settings.json')
  }
}
