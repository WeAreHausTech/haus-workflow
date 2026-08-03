/** `haus update` — refreshes the lockfile, syncs the remote catalog cache, and checks for CLI updates. */
import path from 'node:path'

import { findFormerIdMigrations } from '../catalog/former-ids.js'
import { loadCatalog } from '../catalog/load-catalog.js'
import { fetchLatestCatalogTag, syncRemoteCatalog } from '../catalog/remote-catalog.js'
import { refreshProjectApply } from '../claude/refresh-project.js'
import { applyInstall } from '../install/apply.js'
import { diffGeneratedFiles, summarizeLockDiff } from '../update/diff-generated-files.js'
import {
  applyLock,
  checkLock,
  diffLock,
  hasLocalOverrides,
  readLockSummary,
} from '../update/lockfile.js'
import { fetchNpmVersionStatus } from '../update/npm-version.js'
import { readJson } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { hausPath, packageRoot } from '../utils/paths.js'

const NPM_PACKAGE_NAME = '@haus-tech/haus-workflow'

/**
 * Updates the lockfile and syncs the remote catalog; with --check, reports drift without writing.
 * Also checks npm for a newer CLI version and reports if one is available.
 */
export async function runUpdate(options: {
  check?: boolean
  fast?: boolean
  fromHook?: boolean
}): Promise<void> {
  const root = process.cwd()
  // --from-hook takes precedence over --check (only the SessionStart hook passes
  // --from-hook, and always alone) — its own silent/JSON-on-drift output shape.
  if (options.fromHook) {
    await runFromHookCheck(root)
    return
  }
  if (options.check) {
    const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
    const currentVersion = pkgJson?.version ?? '0.0.0'
    // --fast skips per-item content hashing (checkLock) and the global-install hash
    // check, using the cheap count+catalogRef-only readLockSummary instead — the same
    // tier the SessionStart hook uses. There is a real middle ground now between that
    // cheap tier and the fully-hashed one, instead of only those two extremes.
    // formerId migration detection is cheap (structural id lookups, no content hashing)
    // and runs in both modes.
    const [status, npmVersion, latestCatalogTag, globalInstallDrift, catalogItems, lockItems] =
      await Promise.all([
        options.fast ? fastLockStatus(root) : checkLock(root),
        fetchNpmVersionStatus(currentVersion),
        fetchLatestCatalogTag(),
        options.fast ? Promise.resolve(null) : detectGlobalInstallDrift(),
        loadCatalog(root),
        readJson<Array<{ id: string }>>(hausPath(root, 'haus.lock.json')),
      ])
    const formerIdMigrations = findFormerIdMigrations(lockItems ?? [], catalogItems)
    // --fast keeps an unrecorded catalogRef as null ("unknown") rather than defaulting
    // to 'main' — defaulting would produce a false "behind" reading here for the exact
    // reason runFromHookCheck already avoids it (a lock with no ref would otherwise
    // almost always compare as behind any real release tag). The full tier keeps its
    // existing 'main' default unchanged — it's pre-existing --check output shape this
    // fix does not touch.
    const installedRef = options.fast ? status.catalogRef : (status.catalogRef ?? 'main')
    const catalogRefBehind =
      installedRef !== null && latestCatalogTag !== null && installedRef !== latestCatalogTag
        ? `installed from ${installedRef}, latest tag is ${latestCatalogTag}`
        : false
    log(
      JSON.stringify(
        {
          ...status,
          checkMode: options.fast ? 'fast' : 'full',
          installedCatalogRef: installedRef,
          latestCatalogTag,
          catalogRefBehind,
          formerIdMigrations,
          globalInstallDrift,
          localOverrides: await hasLocalOverrides(root),
          summary: diffGeneratedFiles(),
          npmVersion,
        },
        null,
        2,
      ),
    )
    // Fast mode never had enough information to detect real hash-based drift (no
    // hashing ran), so it never fails the check purely on that — doing so would imply
    // content was verified when it wasn't. An empty/missing lockfile also means "this
    // project was never set up by haus," not "drift". formerId migrations are a
    // separate, non-hash-based signal and fail the check in both modes.
    const hasHashDrift = !options.fast && status.count > 0 && 'ok' in status && !status.ok
    if (hasHashDrift || formerIdMigrations.length > 0) process.exitCode = 1
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
 * SessionStart hook mode: silently checks whether this project is behind the installed
 * haus package/catalog and, only when it is, emits a hookSpecificOutput note nudging the
 * user toward `/haus-workflow project:refresh`. Prints nothing when up to date, and never
 * throws — an offline or unreachable registry must not block session start.
 */
export async function runFromHookCheck(root: string): Promise<void> {
  try {
    // Cheap: just the lock's item count + catalog ref, no per-item content hashing (that's
    // what `checkLock` does, and this hook runs on every SessionStart — hashing every
    // tracked file's content that often is needless latency for a version/ref check).
    const summary = await readLockSummary(root)
    // No (or empty) lockfile means this project was never set up by haus — nothing to
    // nudge about, and comparing versions/catalog refs would be meaningless noise. Check
    // this BEFORE the network calls below so a non-haus directory costs nothing.
    if (summary.count === 0) return

    const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
    const currentVersion = pkgJson?.version ?? '0.0.0'
    const [npmVersion, latestCatalogTag] = await Promise.all([
      fetchNpmVersionStatus(currentVersion),
      fetchLatestCatalogTag(),
    ])

    // No recorded catalogRef means we genuinely don't know what it was installed from —
    // treat that as "unknown", not "main", so it's never wrongly compared against a real
    // release tag (a lock with no ref would otherwise almost always report false "behind").
    const installedRef = summary.catalogRef
    const catalogBehind =
      installedRef !== null && latestCatalogTag !== null && installedRef !== latestCatalogTag
    const npmBehind = npmVersion.updateAvailable && npmVersion.latest !== null

    if (!npmBehind && !catalogBehind) return

    const reasons: string[] = []
    if (npmBehind) reasons.push(`haus package ${currentVersion} → ${npmVersion.latest} available`)
    if (catalogBehind) {
      reasons.push(`catalog installed from ${installedRef}, latest is ${latestCatalogTag}`)
    }

    log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext:
            `This project's haus setup is behind: ${reasons.join('; ')}. ` +
            'Suggest running `/haus-workflow project:refresh` to bring it up to date.',
        },
      }),
    )
  } catch {
    // Registry unreachable, malformed lockfile, etc. — fail silent, never block the session.
  }
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
    if (result.userEdited.length > 0) {
      log(
        `Preserved ${result.userEdited.length} locally-edited file(s) (run \`haus install --force\` to overwrite).`,
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

/**
 * `--check --fast`'s status shape: the cheap count+catalogRef-only read, with no `ok`
 * field (unlike `checkLock`'s LockCheckResult) because no hashing ran to determine it —
 * omitting it is more honest than guessing. `drift`/`driftCount` are always empty/zero
 * for the same reason, kept only so downstream JSON consumers see a consistent shape
 * across both check modes.
 */
async function fastLockStatus(
  root: string,
): Promise<{ count: number; catalogRef: string | null; drift: []; driftCount: 0 }> {
  const summary = await readLockSummary(root)
  return { count: summary.count, catalogRef: summary.catalogRef, drift: [], driftCount: 0 }
}
