/**
 * Shared setup pipeline parameterized on an explicit `root`.
 *
 * This is the single source of truth for the scan → recommend → apply flow.
 * `setup-project` wraps it with a confirm() gate.
 * The upcoming workspace setup loop will call it once per member repo so every
 * repo gets byte-identical output to `haus setup-project`.
 */
import { syncRemoteCatalog } from '../catalog/remote-catalog.js'
import { verifyProjectSettingsHooksContract } from '../claude/verify-hooks-contract.js'
import { writeClaudeFiles } from '../claude/write-claude-files.js'
import { recommend } from '../recommender/recommend.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { scanProject } from '../scanner/scan-project.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

export type SetupCoreResult = {
  root: string
  repoName: string
  roles: string[]
  recommendedCount: number
  warnings: string[]
  hooksOk: boolean
  written: string[]
}

export type SetupCoreOptions = {
  json?: boolean
  apply: boolean
  dryRun?: boolean
  /**
   * Optional gate run after the doctor summary and before any files are written.
   * Returning false aborts the write (used by interactive `setup-project`).
   * Omitted by the non-interactive workspace loop, which writes when `apply` is set.
   */
  confirm?: () => Promise<boolean>
}

/**
 * Runs scan → recommend → write recommendation artifacts → verify hooks contract,
 * then (when `apply`) writes Claude files. Returns a structured summary.
 *
 * Logging mirrors the previous inline `setup-project` flow so human output is
 * unchanged. Sets `process.exitCode = 1` when the hooks contract fails, matching
 * prior behaviour.
 */
export async function runSetupCore(root: string, opts: SetupCoreOptions): Promise<SetupCoreResult> {
  const { json, apply, dryRun, confirm } = opts

  // Scan
  const scanResult = await scanProject(root)
  if (json) {
    log(JSON.stringify(scanResult, null, 2))
  } else {
    log('Haus scan complete')
    log(`Roles: ${scanResult.repoRoles.join(', ') || 'unknown'}`)
    log(`Package manager: ${scanResult.packageManager}`)
  }

  // Recommend
  const context = await readContextOrScan(root)
  const recommendation = await recommend(root, context)
  await writeJson(hausPath(root, 'recommendation.json'), recommendation)
  if (json) {
    log(JSON.stringify(recommendation, null, 2))
  } else {
    log('Haus recommendation ready')
    log(`Recommended: ${recommendation.recommended.length}`)
    log(`Skipped: ${recommendation.skipped.length}`)
  }

  // Doctor summary
  const hooks = await verifyProjectSettingsHooksContract(root)
  const warningLines = [...new Set([...context.warnings, ...(recommendation.warnings ?? [])])]
  log(`Repo: ${context.repoName}`)
  for (const warning of warningLines) log(`- WARN: ${warning}`)
  // `skipped` implies ok:true (no settings.json to check) — report the doctor's
  // ok status so "skipped but ok" is not mistaken for a failure.
  const hooksOk = hooks.ok
  if (hooks.skipped) {
    log(`- HOOKS: (skipped) ${hooks.message}`)
  } else if (!hooks.ok) {
    log(`- HOOKS FAIL: ${hooks.message}`)
    process.exitCode = 1
  } else {
    log(`- HOOKS OK: ${hooks.message}`)
  }

  const baseResult: SetupCoreResult = {
    root,
    repoName: context.repoName,
    roles: scanResult.repoRoles,
    recommendedCount: recommendation.recommended.length,
    warnings: warningLines,
    hooksOk,
    written: [],
  }

  if (!apply) return baseResult

  if (confirm) {
    const approved = await confirm()
    if (!approved) {
      log('Setup reviewed. No files written.')
      log('Next step: run `haus apply --write` when ready.')
      return baseResult
    }
  }

  // Populate catalog cache before apply so recommend/apply share the same manifest
  // and skill bodies are available on first-time setup when online.
  if (!dryRun && !process.env['HAUS_FIXTURE_CATALOG']) {
    log('Syncing remote catalog...')
    const sync = await syncRemoteCatalog()
    if (sync.newItems.length > 0) {
      log(`Catalog cache populated: ${sync.newItems.length} new item(s).`)
    } else if (sync.refreshed.length > 0) {
      log(`Catalog cache refreshed: ${sync.refreshed.length} updated item(s).`)
    }
  }

  const files = await writeClaudeFiles(root, dryRun ?? false)
  log('Applied files:')
  files.forEach((f) => log(`- ${displayPath(root, f)}`))

  // Post-apply doctor check
  const hooksAfter = await verifyProjectSettingsHooksContract(root)
  const hooksOkAfter = hooksAfter.ok
  if (hooksAfter.skipped) {
    log(`- HOOKS: (skipped) ${hooksAfter.message}`)
  } else if (!hooksAfter.ok) {
    log(`- HOOKS FAIL: ${hooksAfter.message}`)
    process.exitCode = 1
  } else {
    log(`- HOOKS OK: ${hooksAfter.message}`)
  }

  return { ...baseResult, hooksOk: hooksOkAfter, written: files }
}
