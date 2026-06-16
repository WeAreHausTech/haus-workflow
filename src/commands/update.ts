/** `haus update` — refreshes the lockfile, syncs the remote catalog cache, and checks for CLI updates. */
import path from 'node:path'

import { fetchLatestCatalogTag, syncRemoteCatalog } from '../catalog/remote-catalog.js'
import { refreshProjectApply } from '../claude/refresh-project.js'
import { applyInstall } from '../install/apply.js'
import { diffGeneratedFiles, summarizeLockDiff } from '../update/diff-generated-files.js'
import { applyLock, checkLock, diffLock, hasLocalOverrides } from '../update/lockfile.js'
import { fetchNpmVersionStatus } from '../update/npm-version.js'
import { readJson } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { packageRoot } from '../utils/paths.js'

const NPM_PACKAGE_NAME = '@haus-tech/haus-workflow'

/**
 * Updates the lockfile and syncs the remote catalog; with --check, reports drift without writing.
 * Also checks npm for a newer CLI version and reports if one is available.
 */
export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd()
  if (options.check) {
    const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
    const currentVersion = pkgJson?.version ?? '0.0.0'
    const [status, npmVersion, latestCatalogTag, globalInstallDrift] = await Promise.all([
      checkLock(root),
      fetchNpmVersionStatus(currentVersion),
      fetchLatestCatalogTag(),
      detectGlobalInstallDrift(),
    ])
    const installedRef = status.catalogRef ?? 'main'
    const catalogRefBehind =
      latestCatalogTag !== null && installedRef !== latestCatalogTag
        ? `installed from ${installedRef}, latest tag is ${latestCatalogTag}`
        : false
    log(
      JSON.stringify(
        {
          ...status,
          installedCatalogRef: installedRef,
          latestCatalogTag,
          catalogRefBehind,
          globalInstallDrift,
          localOverrides: await hasLocalOverrides(root),
          summary: diffGeneratedFiles(),
          npmVersion,
        },
        null,
        2,
      ),
    )
    if (!status.ok) process.exitCode = 1
    if (status.driftCount > 0) process.exitCode = 1
    return
  }

  const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
  const currentVersion = pkgJson?.version ?? '0.0.0'
  const npmStatus = await fetchNpmVersionStatus(currentVersion)
  if (npmStatus.updateAvailable && npmStatus.latest !== null) {
    log(`npm update available: ${currentVersion} → ${npmStatus.latest}`)
    log(`Run: npm install -g ${NPM_PACKAGE_NAME}`)
  } else if (npmStatus.latest !== null) {
    log(`npm package up to date: ${currentVersion}`)
  }

  if (await hasLocalOverrides(root)) {
    log('Existing .claude/settings.json — haus rules will be merged, not replaced.')
  }
  const { before, after } = await applyLock(root)
  log(diffLock(before, after))
  log(summarizeLockDiff(before, after))

  log('Syncing remote catalog...')
  const sync = await syncRemoteCatalog()
  if (sync.newItems.length > 0) {
    log(`Catalog updated: ${sync.newItems.length} new item(s): ${sync.newItems.join(', ')}`)
    log('Run `haus recommend && haus apply --write` to install new skills.')
  }
  if (sync.refreshed.length > 0) {
    log(`Catalog refreshed: ${sync.refreshed.length} updated item(s): ${sync.refreshed.join(', ')}`)
    log('Run `haus apply --write` to install refreshed skill content.')
  }
  if (sync.newItems.length === 0 && sync.refreshed.length === 0 && sync.unchanged > 0) {
    log(`Catalog up to date (${sync.unchanged} item(s) unchanged).`)
  }
  if (sync.failed.length > 0) {
    warn(`Failed to fetch ${sync.failed.length} item(s): ${sync.failed.join(', ')}`)
  }

  await refreshGlobalInstall()
  await refreshProjectFiles(root)

  log('Update applied with backup in .haus-workflow/backups/. Run haus doctor.')
}

/**
 * Re-applies haus-managed project `.claude/` files when this repo was previously set up.
 * Skips fresh projects with no haus artifacts. Failures warn instead of aborting update.
 */
async function refreshProjectFiles(root: string): Promise<void> {
  log('Refreshing project .claude/ files...')
  try {
    const files = await refreshProjectApply(root)
    if (files.length === 0) {
      log('No prior haus project setup detected — skipped project re-apply.')
      return
    }
    log(`Project refreshed: ${files.length} managed path(s) updated.`)
  } catch (err) {
    warn(`Could not refresh project files: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Refreshes the Haus-managed files in `~/.claude/` (skills, slash commands, hook/security
 * settings) so `haus update` matches its documented scope. User-edited managed files are
 * preserved (no --force). A non-writable home directory warns instead of failing the update.
 */
async function refreshGlobalInstall(): Promise<void> {
  log('Refreshing ~/.claude/ global files...')
  try {
    const result = await applyInstall({})
    const total = result.created.length + result.updated.length
    if (total > 0) {
      log(`~/.claude refreshed: ${result.created.length} added, ${result.updated.length} updated.`)
    } else {
      log('~/.claude already up to date.')
    }
    if (result.skipped.length > 0) {
      log(
        `Preserved ${result.skipped.length} locally-edited file(s) (run \`haus install --force\` to overwrite).`,
      )
    }
  } catch (err) {
    warn(`Could not refresh ~/.claude/: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Returns whether the global `~/.claude/` install has drifted from bundled sources; null if undetectable. */
async function detectGlobalInstallDrift(): Promise<boolean | null> {
  try {
    const result = await applyInstall({ check: true })
    return result.drift
  } catch {
    return null
  }
}
