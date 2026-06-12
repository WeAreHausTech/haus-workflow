/**
 * Orchestrates writing all .claude/ outputs: settings, rules, commands, catalog items, and lock.
 * Uses a diff-first approach — only writes when content has actually changed.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { catalogItemContentPath, loadCatalogContext } from '../catalog/load-catalog.js'
import { getResolvedCatalogRef, isCatalogRefResolved } from '../catalog/remote-catalog.js'
import type { Recommendation } from '../types.js'
import { hashInstalledPaths } from '../update/hash-installed.js'
import { pruneEmptyDir, readJson } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { claudePath, displayPath, hausPath, packageRoot } from '../utils/paths.js'

import { DEFAULT_HOOKS_CONFIG } from './load-hooks-config.js'
import { writeManagedJson, writeManagedText } from './managed-write.js'
import { applyProjectSettingsMerge, mergeProjectSettings } from './merge-project-settings.js'
import {
  SUPERPOWERS_ORIGIN_SOURCE_ID,
  installCatalogSkill,
  installSuperpowersShared,
} from './superpowers-install.js'
import { assertPostApplySettingsHausContract } from './verify-hooks-contract.js'
import { writeRootClaudeMd } from './write-root-claude-md.js'
import { writeWorkflowConfig } from './write-workflow-config.js'
import { writeWorkflow } from './write-workflow.js'

/** Map catalog item type to `.claude/` subdir; null = unknown type (skip). */
export function targetDirForType(type: string): string | null {
  if (type === 'agent') return 'agents'
  if (type === 'template') return 'templates'
  if (type === 'command') return 'commands'
  if (type === 'skill') return 'skills'
  return null
}

/**
 * Write all managed .claude/ files for the project at `root`.
 * In dry-run mode, logs diffs but does not write anything to disk.
 * Returns the full set of file paths that were written (or would be written).
 */
export async function writeClaudeFiles(
  root: string,
  dryRun: boolean,
  selectedIds?: string[],
  opts: { refillConfig?: boolean; force?: boolean } = {},
): Promise<string[]> {
  const rec = (await readJson<Recommendation>(hausPath(root, 'recommendation.json'))) ?? {
    recommended: [],
    skipped: [],
    warnings: [],
    estimatedContextTokens: 0,
    selectedRules: 0,
    skippedRules: 0,
    estimatedTokenReductionPct: 0,
  }
  const pkgRoot = packageRoot()
  const hausVersion =
    (await readJson<{ version?: string }>(path.join(pkgRoot, 'package.json')))?.version ?? '0.0.0'

  // The lock is only written during actual apply, not dry-run.
  const coreFiles = [
    claudePath(root, 'settings.json'),
    claudePath(root, 'rules', 'haus.md'),
    claudePath(root, 'commands', 'haus-doctor.md'),
  ]
  const rootClaudeMdPath = await writeRootClaudeMd(root, dryRun)
  const workflowPath = await writeWorkflow(root, hausVersion, dryRun, opts.force)
  const workflowConfigPath = await writeWorkflowConfig(root, dryRun, {
    refill: opts.refillConfig,
  })
  const p6Files = [
    rootClaudeMdPath,
    ...(workflowPath ? [workflowPath] : []),
    ...(workflowConfigPath ? [workflowConfigPath] : []),
  ]
  const files = dryRun
    ? [...coreFiles, ...p6Files]
    : [...coreFiles, ...p6Files, hausPath(root, 'haus.lock.json')]
  if (dryRun) {
    const mergedSettings = await mergeProjectSettings(root)
    await writeManagedJson(root, claudePath(root, 'settings.json'), mergedSettings, true)
  } else {
    await applyProjectSettingsMerge(root)
    await assertPostApplySettingsHausContract(root)
  }
  // Emit `.haus-workflow/config.json` with the P2 hook gating defaults (both off).
  // Only created when missing — existing config is left untouched so users'
  // opt-ins survive subsequent `apply --write` runs.
  const configPath = hausPath(root, 'config.json')
  if (!(await fs.pathExists(configPath))) {
    await writeManagedJson(root, configPath, DEFAULT_HOOKS_CONFIG, dryRun)
  }
  await writeManagedText(
    root,
    claudePath(root, 'commands', 'haus-doctor.md'),
    'Run `haus doctor`.',
    dryRun,
  )
  // Legacy: haus-review was a managed core command, removed in favour of the review
  // skills. Delete the stale stub from projects that installed it earlier, but only
  // when its content byte-for-byte matches the historical stub so a user-customised
  // file is never destroyed. Match exactly (allowing one optional trailing newline,
  // LF or CRLF) — any other whitespace edit counts as a user change and is preserved.
  const legacyReviewPath = claudePath(root, 'commands', 'haus-review.md')
  if (await fs.pathExists(legacyReviewPath)) {
    const content = await fs.readFile(legacyReviewPath, 'utf8')
    const stub = 'Run `haus context --task "code review"` then review diff.'
    if (content === stub || content === `${stub}\n` || content === `${stub}\r\n`) {
      if (dryRun) {
        log(`[dry-run] would remove stale ${displayPath(root, legacyReviewPath)}`)
      } else {
        await fs.remove(legacyReviewPath)
      }
    }
  }
  // The haus rule now also carries the two security lines that previously lived in a
  // separate security.md (the advisory mirror of settings.json deny/ask), plus a guard
  // against hand-editing haus-managed files. settings.json + the guard hooks remain the
  // deterministic enforcement layer; this rule is the advisory half WORKFLOW.md requires.
  await writeManagedText(
    root,
    claudePath(root, 'rules', 'haus.md'),
    [
      '- Keep context minimal.',
      '- Follow project conventions.',
      '- Never read secrets.',
      '- Block dangerous shell commands.',
      '- NEVER hand-edit haus-managed blocks (`<!-- HAUS:BEGIN … -->` … `<!-- HAUS:END … -->`)',
      '  or haus-owned files under `.claude/` / `.haus-workflow/` — regenerate via `haus apply`.',
      '  Hand-edits are silently overwritten or flagged as drift.',
      '',
      '## Driving haus',
      'haus owns `.claude/` and `.haus-workflow/`. When the user asks to set up, configure,',
      'check, fix, refresh, or update the project, run the matching `haus` command and narrate',
      'results in plain language — never make them use a terminal or read JSON.',
      '- Set up / configure / fix / check → `haus setup-project`, `haus apply --write`, `haus doctor`',
      '- Update package + catalog → `haus update`',
      '- The `/haus-workflow`, `/haus-setup`, `/haus-doctor`, and `/haus-fix` commands do the same.',
      '',
    ].join('\n'),
    dryRun,
  )
  // Legacy: the two security lines moved into haus.md (above). Remove the standalone
  // security.md from projects that installed it earlier, but only when its content
  // byte-for-byte matches the historical stub so a user-customised file is preserved.
  const legacySecurityPath = claudePath(root, 'rules', 'security.md')
  if (await fs.pathExists(legacySecurityPath)) {
    const content = await fs.readFile(legacySecurityPath, 'utf8')
    const stub = '- Never read secrets.\n- Block dangerous shell commands.'
    if (content === stub || content === `${stub}\n` || content === `${stub}\r\n`) {
      if (dryRun) {
        log(`[dry-run] would remove stale ${displayPath(root, legacySecurityPath)}`)
      } else {
        await fs.remove(legacySecurityPath)
      }
    }
  }
  // Legacy: selected-context.json was a readerless, fully machine-generated artifact
  // (a subset of haus.lock.json) that is no longer written. It was never user-authored,
  // so remove it unconditionally from projects that installed it earlier.
  const legacySelectedContextPath = hausPath(root, 'selected-context.json')
  if (await fs.pathExists(legacySelectedContextPath)) {
    if (dryRun) {
      log(`[dry-run] would remove stale ${displayPath(root, legacySelectedContextPath)}`)
    } else {
      await fs.remove(legacySelectedContextPath)
    }
  }

  type ManifestItem = {
    id: string
    path: string
    type: string
    source?: string
    reviewStatus?: string
    riskLevel?: string
    originSourceId?: string
    useMode?: string
    license?: string
  }
  const { items: manifestItems, contentRoot } = await loadCatalogContext(root)
  const manifestById = new Map((manifestItems as ManifestItem[]).map((item) => [item.id, item]))
  const installedPathsByItem = new Map<string, string[]>()
  // Track which recommended items were actually installed so that skipped
  // curated items (unapproved or blocked) are excluded from the lock — a stale
  // recommendation.json must not cause unapproved artifacts to appear in the
  // written state.
  const installedIds = new Set<string>()

  const catalogItems =
    selectedIds !== undefined
      ? rec.recommended.filter((r) => selectedIds.includes(r.id))
      : rec.recommended

  let curatedReviewStatusSkips = 0
  let superpowersSharedInstalled = false
  for (const item of catalogItems) {
    const manifestItem = manifestById.get(item.id)
    if (!manifestItem?.path) continue
    // Curated items must be approved and not blocked before they are written to disk.
    if (manifestItem.source === 'curated') {
      if (manifestItem.reviewStatus !== 'approved') {
        curatedReviewStatusSkips++
        if (curatedReviewStatusSkips === 1) {
          warn(
            `Skipping curated item ${item.id}: reviewStatus is not approved (${manifestItem.reviewStatus ?? 'unset'})`,
          )
        }
        continue
      }
      if (manifestItem.riskLevel === 'blocked') {
        warn(`Skipping curated item ${item.id}: riskLevel is blocked`)
        continue
      }
    }
    const sourcePath = catalogItemContentPath(contentRoot, manifestItem)
    const target = targetDirForType(item.type)
    if (!target) {
      warn(
        `Skipping ${item.id}: type "${item.type}" is unknown to this haus version — upgrade the CLI to use it`,
      )
      continue
    }
    const destination = claudePath(root, target, path.basename(sourcePath))
    if (await fs.pathExists(sourcePath)) {
      if (dryRun) {
        const exists = await fs.pathExists(destination)
        log(
          `${displayPath(root, destination)}: ${exists ? 'would overwrite' : 'would create'} (${item.id})`,
        )
      } else if (item.type === 'skill') {
        await installCatalogSkill(sourcePath, destination, {
          originSourceId: manifestItem.originSourceId,
          dryRun: false,
        })
      } else {
        await fs.ensureDir(path.dirname(destination))
        await fs.copy(sourcePath, destination, { overwrite: true, errorOnExist: false })
      }
      files.push(destination)
      const relPaths = [path.relative(root, destination)]
      if (
        !superpowersSharedInstalled &&
        manifestItem.originSourceId === SUPERPOWERS_ORIGIN_SOURCE_ID &&
        item.type === 'skill'
      ) {
        const sharedRel = await installSuperpowersShared(contentRoot, root, dryRun)
        if (sharedRel) {
          superpowersSharedInstalled = true
          relPaths.push(sharedRel)
          files.push(path.join(root, sharedRel))
        }
      }
      const current = installedPathsByItem.get(item.id) ?? []
      installedPathsByItem.set(item.id, [...current, ...relPaths])
      installedIds.add(item.id)
    } else {
      warn(
        `Skipping ${item.id}: source not found at ${sourcePath} — run \`haus update\` to populate catalog cache`,
      )
    }
  }

  if (curatedReviewStatusSkips > 1) {
    warn(
      `${curatedReviewStatusSkips} curated items skipped: reviewStatus is not approved — possible catalog field rename upstream`,
    )
  }

  // Remove items that were installed on a prior run (recorded in the lock) but have
  // since been removed from the catalog manifest entirely. Items that merely fall out
  // of the current selection (e.g. `apply --select`) yet still exist in the catalog are
  // left untouched. Hash-gated: only unmodified copies are deleted, matching the
  // global-install orphan-cleanup contract.
  await cleanupStaleCatalogItems(root, new Set(manifestById.keys()), dryRun)

  if (dryRun) return [...new Set(files)]

  const installedItems = catalogItems.filter((r) => installedIds.has(r.id))
  const prevLock = await readJson<PrevLockEntry[]>(hausPath(root, 'haus.lock.json'))
  const prevRefById = new Map(
    (prevLock ?? []).filter((e) => e.id && e.catalogRef).map((e) => [e.id!, e.catalogRef!]),
  )
  const lockCatalogRef = (itemId: string): string =>
    isCatalogRefResolved()
      ? getResolvedCatalogRef()
      : (prevRefById.get(itemId) ?? getResolvedCatalogRef())
  const lock = await Promise.all(
    installedItems.map(async (r) => {
      const relPaths = installedPathsByItem.get(r.id) ?? []
      const manifestItem = manifestById.get(r.id)
      const isCurated = manifestItem?.source === 'curated'
      const base = {
        id: r.id,
        type: r.type,
        source: isCurated ? 'curated' : 'haus',
        version: hausVersion,
        catalogRef: lockCatalogRef(r.id),
        hash: await hashInstalledPaths(root, relPaths),
        installMode: 'copied',
        paths: relPaths,
      }
      if (!isCurated || !manifestItem) return base
      // Attach curated provenance fields to lock entry for auditability.
      return {
        ...base,
        ...(manifestItem.originSourceId ? { originSourceId: manifestItem.originSourceId } : {}),
        ...(manifestItem.useMode ? { useMode: manifestItem.useMode } : {}),
        ...(manifestItem.license ? { license: manifestItem.license } : {}),
        ...(manifestItem.riskLevel ? { riskLevel: manifestItem.riskLevel } : {}),
        ...(manifestItem.reviewStatus ? { reviewStatus: manifestItem.reviewStatus } : {}),
      }
    }),
  )
  await writeManagedJson(root, hausPath(root, 'haus.lock.json'), lock, false)

  return [...new Set(files)]
}

type PrevLockEntry = { id?: string; paths?: string[]; hash?: string; catalogRef?: string }

/**
 * Deletes catalog items installed on a previous run (per the existing lock) that are no
 * longer present in the catalog manifest. Only removes on-disk copies whose content still
 * matches the recorded lock hash; user-modified files are preserved with a warning. Items
 * still in the manifest but unselected this run are intentionally left in place.
 */
async function cleanupStaleCatalogItems(
  root: string,
  knownIds: Set<string>,
  dryRun: boolean,
): Promise<void> {
  const prevLock = await readJson<PrevLockEntry[]>(hausPath(root, 'haus.lock.json'))
  if (!prevLock?.length) return
  for (const entry of prevLock) {
    if (!entry.id || knownIds.has(entry.id)) continue
    const relPaths = entry.paths ?? []
    if (relPaths.length === 0) continue
    const existing: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.join(root, rel))) existing.push(rel)
    }
    if (existing.length === 0) continue
    if (entry.hash === undefined) {
      warn(
        `Stale catalog item ${entry.id} has no lock hash — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    const currentHash = await hashInstalledPaths(root, relPaths)
    if (currentHash !== entry.hash) {
      warn(
        `Stale catalog item ${entry.id} was modified locally — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    for (const rel of existing) {
      const abs = path.join(root, rel)
      if (dryRun) {
        log(`[dry-run] would remove stale ${displayPath(root, abs)} (${entry.id})`)
        continue
      }
      await fs.remove(abs)
      await pruneEmptyDir(path.dirname(abs))
      log(`Removed stale ${displayPath(root, abs)} (${entry.id})`)
    }
  }
}
