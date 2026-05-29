/**
 * Detects the active package manager for a project root.
 * Checks the packageManager field in package.json first, then falls back to lockfile presence.
 */
import path from 'node:path'

import fs from 'fs-extra'

import type { PackageManager } from '../types.js'
import { satisfiesVersion } from '../utils/versions.js'

/**
 * Resolves which package manager is in use for the given project root.
 *
 * @param root - Absolute path to the project root.
 * @param packageManagerField - Raw value of the `packageManager` field from package.json (e.g. "yarn@4.1.0").
 * @returns The detected package manager, or `"unknown"` when none can be determined.
 */
export function detectPackageManager(root: string, packageManagerField?: string): PackageManager {
  const field = String(packageManagerField ?? '').trim()

  // Prefer the explicit packageManager field — it carries the exact version so we
  // can validate against supported ranges before trusting it.
  if (field.startsWith('yarn@')) {
    const version = field.slice('yarn@'.length)
    if (satisfiesVersion(version, '>=4 <5')) return 'yarn'
    return 'unknown'
  }
  if (field.startsWith('pnpm@')) {
    const version = field.slice('pnpm@'.length)
    if (satisfiesVersion(version, '>=8 <10')) return 'pnpm'
    return 'unknown'
  }
  if (field.startsWith('npm@')) {
    const version = field.slice('npm@'.length)
    if (satisfiesVersion(version, '>=9')) return 'npm'
    return 'unknown'
  }

  // No (or unrecognised) packageManager field — fall back to lockfile sniffing.
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm'
  return 'unknown'
}
