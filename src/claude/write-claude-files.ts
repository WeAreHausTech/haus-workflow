/**
 * Orchestrates writing all .claude/ outputs: settings, rules, commands, catalog items, and lock.
 * Uses a diff-first approach — only writes when content has actually changed.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { findFormerIdMigrations } from '../catalog/former-ids.js'
import { validateCatalogItem } from '../catalog/ingest-catalog.js'
import { catalogItemContentPath, loadCatalogContext } from '../catalog/load-catalog.js'
import { getResolvedCatalogRef, isCatalogRefResolved } from '../catalog/remote-catalog.js'
import { findOrphanedLockEntries } from '../recommender/orphaned-items.js'
import type { Recommendation } from '../types.js'
import { hashInstalledPaths } from '../update/hash-installed.js'
import { pruneEmptyDir, readJson } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { claudePath, displayPath, hausPath, packageRoot } from '../utils/paths.js'

import { writeManagedJson, writeManagedText } from './managed-write.js'
import { applyProjectSettingsMerge, mergeProjectSettings } from './merge-project-settings.js'
import {
  SUPERPOWERS_ORIGIN_SOURCE_ID,
  installCatalogSkill,
  installSuperpowersShared,
} from './superpowers-install.js'
import { assertPostApplySettingsHausContract } from './verify-hooks-contract.js'
import { writeDecisionsSeed } from './write-decisions-seed.js'
import { writePrettierIgnore } from './write-prettierignore.js'
import { writeRootClaudeMd } from './write-root-claude-md.js'
import { writeWorkflowConfig } from './write-workflow-config.js'
import { writeWorkflow } from './write-workflow.js'

/**
 * Map catalog item type to `.claude/` subdir. Returns null for types not written
 * to `.claude/` — either unknown types or `config` (distributed via `haus scaffold`).
 */
export function targetDirForType(type: string): string | null {
  if (type === 'agent') return 'agents'
  if (type === 'template') return 'templates'
  if (type === 'command') return 'commands'
  if (type === 'skill') return 'skills'
  // 'config' items are distributed via `haus scaffold`, not `haus apply`
  return null
}

/**
 * Removes a legacy managed stub file at `relPathSegments` if — and only if — its
 * content is a byte-for-byte match (allowing one optional trailing LF or CRLF) for
 * `stub`. A file that differs at all is treated as user-customized and left untouched.
 */
async function removeLegacyManagedStub(
  root: string,
  relPathSegments: string[],
  stub: string,
  dryRun: boolean,
  say: (text: string) => void,
): Promise<void> {
  const target = claudePath(root, ...relPathSegments)
  if (!(await fs.pathExists(target))) return
  const content = await fs.readFile(target, 'utf8')
  if (content !== stub && content !== `${stub}\n` && content !== `${stub}\r\n`) return
  if (dryRun) {
    say(`[dry-run] would remove stale ${displayPath(root, target)}`)
  } else {
    await fs.remove(target)
  }
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
  opts: { refillConfig?: boolean; force?: boolean; quiet?: boolean; prune?: boolean } = {},
): Promise<string[]> {
  const say = opts.quiet ? () => {} : log
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
  const coreFiles = [claudePath(root, 'settings.json'), claudePath(root, 'rules', 'haus.md')]
  const rootClaudeMdPath = await writeRootClaudeMd(root, dryRun)
  const decisionsSeedPath = await writeDecisionsSeed(root, dryRun)
  const workflowPath = await writeWorkflow(root, hausVersion, dryRun, opts.force)
  const workflowConfigPath = await writeWorkflowConfig(root, dryRun, {
    refill: opts.refillConfig,
  })
  // Keep the project formatter off haus-owned output: prettier reformatting
  // .haus-workflow/WORKFLOW.md breaks the hash embedded in its managed header and
  // makes doctor report a phantom user edit. See write-prettierignore.ts.
  const prettierIgnorePath = await writePrettierIgnore(root, dryRun)
  const p6Files = [
    rootClaudeMdPath,
    ...(decisionsSeedPath ? [decisionsSeedPath] : []),
    ...(workflowPath ? [workflowPath] : []),
    ...(workflowConfigPath ? [workflowConfigPath] : []),
    prettierIgnorePath,
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
  // Legacy: haus-review was a managed core command, removed in favour of the review
  // skills. Delete the stale stub from projects that installed it earlier, but only
  // when its content byte-for-byte matches the historical stub so a user-customised
  // file is never destroyed. Match exactly (allowing one optional trailing newline,
  // LF or CRLF) — any other whitespace edit counts as a user change and is preserved.
  await removeLegacyManagedStub(
    root,
    ['commands', 'haus-review.md'],
    'Run `haus context --task "code review"` then review diff.',
    dryRun,
    say,
  )
  // Legacy: haus-doctor.md was a managed core command stub (a bare, description-less
  // one-liner), removed in favour of routing everything through the /haus-workflow
  // skill. Delete the stale stub from projects that installed it earlier, but only
  // when its content byte-for-byte matches the historical stub so a user-customised
  // file is never destroyed.
  await removeLegacyManagedStub(
    root,
    ['commands', 'haus-doctor.md'],
    'Run `haus doctor`.',
    dryRun,
    say,
  )
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
      '- `/haus-workflow <task>` does the same conversationally (e.g. `init`, `fix`, `doctor`, `reinit`).',
      '',
    ].join('\n'),
    dryRun,
  )
  // Legacy: the two security lines moved into haus.md (above). Remove the standalone
  // security.md from projects that installed it earlier, but only when its content
  // byte-for-byte matches the historical stub so a user-customised file is preserved.
  await removeLegacyManagedStub(
    root,
    ['rules', 'security.md'],
    '- Never read secrets.\n- Block dangerous shell commands.',
    dryRun,
    say,
  )
  // Legacy: these `.haus-workflow/` artifacts were readerless, fully machine-generated
  // outputs that are no longer written. They were never user-authored, so remove them
  // unconditionally from projects that installed them earlier — otherwise an upgrade via
  // `haus apply` would leave them lingering and the output set would not actually shrink.
  const LEGACY_PRUNED_ARTIFACTS = [
    'config.json',
    'selected-context.json',
    'dependency-map.json',
    'scan-hashes.json',
    'recommended-hooks.json',
    'recommended-rules.json',
    'repo-summary.md',
  ]
  for (const rel of LEGACY_PRUNED_ARTIFACTS) {
    const legacyPath = hausPath(root, rel)
    if (await fs.pathExists(legacyPath)) {
      if (dryRun) {
        say(`[dry-run] would remove stale ${displayPath(root, legacyPath)}`)
      } else {
        await fs.remove(legacyPath)
      }
    }
  }

  type ManifestItem = {
    id: string
    formerIds?: string[]
    path: string
    type: string
    source?: string
    reviewStatus?: string
    riskLevel?: string
    originSourceId?: string
    useMode?: string
    license?: string
    ecosystem?: string
  }
  const { items: manifestItems, contentRoot } = await loadCatalogContext(root)
  const manifestById = new Map((manifestItems as ManifestItem[]).map((item) => [item.id, item]))
  const prevLock = (await readJson<PrevLockEntry[]>(hausPath(root, 'haus.lock.json'))) ?? []
  const allMigrations = findFormerIdMigrations(
    prevLock.filter((entry): entry is PrevLockEntry & { id: string } => Boolean(entry.id)),
    manifestItems,
  )
  const migrations = allMigrations.filter(
    (migration) =>
      selectedIds === undefined ||
      selectedIds.includes(migration.oldId) ||
      selectedIds.includes(migration.newId),
  )
  const migrationByOldId = new Map(
    migrations.map((migration) => [migration.oldId, migration.newId]),
  )
  const cleanupManifestById = new Map(manifestById)
  // Map every former id → current item so stale-cleanup does not delete
  // deselected installs that still alias to a live catalog entry.
  for (const migration of allMigrations) {
    const currentItem = manifestById.get(migration.newId)
    if (currentItem) cleanupManifestById.set(migration.oldId, currentItem)
  }
  for (const migration of migrations) {
    if (dryRun) {
      say(`[dry-run] would migrate ${migration.oldId} → ${migration.newId} (upstream rename)`)
    } else {
      warn(`migrated ${migration.oldId} → ${migration.newId} (upstream rename)`)
    }
  }
  await cleanupMigratedCatalogItems(root, prevLock, migrations, dryRun, opts.quiet)

  const installedPathsByItem = new Map<string, string[]>()
  // Track which recommended items were actually installed so that skipped
  // curated items (unapproved or blocked) are excluded from the lock — a stale
  // recommendation.json must not cause unapproved artifacts to appear in the
  // written state.
  const installedIds = new Set<string>()

  const selectedCatalogItems =
    selectedIds !== undefined
      ? rec.recommended.filter((r) => selectedIds.includes(r.id))
      : rec.recommended
  const catalogItemsById = new Map<string, Recommendation['recommended'][number]>()
  for (const recommended of selectedCatalogItems) {
    const id = migrationByOldId.get(recommended.id) ?? recommended.id
    const manifestItem = manifestById.get(id)
    catalogItemsById.set(id, {
      ...recommended,
      id,
      type: manifestItem?.type ?? recommended.type,
    })
  }
  for (const migration of migrations) {
    if (catalogItemsById.has(migration.newId)) continue
    const lockItem = prevLock.find((entry) => entry.id === migration.oldId)
    const manifestItem = manifestById.get(migration.newId)
    if (!lockItem || !manifestItem) continue
    catalogItemsById.set(migration.newId, {
      id: migration.newId,
      type: manifestItem.type,
      reason: 'migrated from former catalog id',
      reasons: [{ code: 'former-id', message: `Renamed from ${migration.oldId}` }],
      selectionMode: 'manual',
      install: true,
    })
  }
  const catalogItems = [...catalogItemsById.values()]

  let curatedReviewStatusSkips = 0
  let superpowersSharedInstalled = false
  for (const item of catalogItems) {
    const manifestItem = manifestById.get(item.id)
    if (!manifestItem?.path) continue
    if (manifestItem.reviewStatus === 'deprecated') {
      warn(`Skipping ${item.id}: reviewStatus is deprecated`)
      continue
    }
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
    // 'config' items are supported but intentionally not written to `.claude/` —
    // they are project-root tooling files distributed explicitly via `haus scaffold`.
    if (item.type === 'config') continue

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
        say(
          `${displayPath(root, destination)}: ${exists ? 'would overwrite' : 'would create'} (${item.id})`,
        )
      } else if (item.type === 'skill') {
        const skillFiles = (await fs.readdir(sourcePath, { recursive: true })).filter(
          (f): f is string => typeof f === 'string' && f.endsWith('.md'),
        )
        let skillValid = true
        for (const relFile of skillFiles) {
          const mdPath = path.join(sourcePath, relFile)
          const mdContent = await fs.readFile(mdPath, 'utf8')
          const mdValidation = validateCatalogItem(
            {
              id: manifestItem.id,
              type: 'skill',
              path: manifestItem.path,
              source: manifestItem.source,
            },
            mdContent,
          )
          if (!mdValidation.ok) {
            warn(
              `Skipping ${item.id}: pre-copy validation failed (${relFile}) — ${mdValidation.reason}`,
            )
            skillValid = false
            break
          }
        }
        if (!skillValid) continue
        await installCatalogSkill(sourcePath, destination, {
          originSourceId: manifestItem.originSourceId,
          dryRun: false,
        })
      } else {
        const fileContent = await fs.readFile(sourcePath, 'utf8')
        const validation = validateCatalogItem(
          {
            id: manifestItem.id,
            type: manifestItem.type as 'skill' | 'agent' | 'template' | 'command' | 'config',
            path: manifestItem.path,
            source: manifestItem.source,
          },
          fileContent,
        )
        if (!validation.ok) {
          warn(`Skipping ${item.id}: pre-copy validation failed — ${validation.reason}`)
          continue
        }
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
  // since been removed from the catalog manifest entirely, or marked deprecated.
  // Items that merely fall out of the current selection (e.g. `apply --select`) yet
  // still exist in the catalog as approved are left untouched. Hash-gated: only
  // unmodified copies are deleted, matching the global-install orphan-cleanup contract.
  await cleanupStaleCatalogItems(root, cleanupManifestById, dryRun, opts.quiet)

  // Opt-in (`--prune`): items that fell out of the current recommendation without
  // being removed from the manifest are left in place by default (see comment above)
  // — `--prune` actually removes them, hash-gated the same way. Shares the exact
  // orphan-detection diff `haus doctor`'s advisory already uses, via findOrphanedLockEntries.
  //
  // "Not orphaned" is widened beyond the raw recommendation so this never overlaps
  // the two cleanups already run above: a former id mid-migration (`allMigrations`)
  // isn't orphaned, it's renamed — `cleanupMigratedCatalogItems` owns that lifecycle.
  // An id removed from the manifest or marked deprecated isn't orphaned either —
  // `cleanupStaleCatalogItems` (just above) already owns and fully handles that case.
  if (opts.prune) {
    const notOrphaned = new Set(rec.recommended.map((r) => r.id))
    for (const migration of allMigrations) notOrphaned.add(migration.oldId)
    for (const entry of prevLock) {
      if (!entry.id) continue
      const manifestItem = manifestById.get(entry.id)
      if (!manifestItem || manifestItem.reviewStatus === 'deprecated') notOrphaned.add(entry.id)
    }
    await pruneOrphanedCatalogItems(root, prevLock, notOrphaned, dryRun, opts.quiet)
  }

  if (dryRun) return [...new Set(files)]

  const installedItems = catalogItems.filter((r) => installedIds.has(r.id))
  const prevRefById = new Map(
    prevLock
      .filter((e) => e.id && e.catalogRef)
      .map((e) => [migrationByOldId.get(e.id!) ?? e.id!, e.catalogRef!]),
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

type CleanupManifestItem = { reviewStatus?: string }

/**
 * Removes an unmodified former-id install before the current item is copied. This
 * prevents a renamed path from lingering and lets same-path renames refresh cleanly.
 * Locally edited former files remain untouched.
 */
async function cleanupMigratedCatalogItems(
  root: string,
  prevLock: PrevLockEntry[],
  migrations: Array<{ oldId: string; newId: string }>,
  dryRun: boolean,
  quiet?: boolean,
): Promise<void> {
  const say = quiet ? () => {} : log
  for (const migration of migrations) {
    const entry = prevLock.find((candidate) => candidate.id === migration.oldId)
    if (!entry) continue
    const relPaths = entry.paths ?? []
    const existing: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.join(root, rel))) existing.push(rel)
    }
    if (existing.length === 0) continue
    if (entry.hash === undefined) {
      warn(
        `Former catalog item ${migration.oldId} has no lock hash — leaving old paths in place: ${existing.join(', ')}`,
      )
      continue
    }
    // Hash the same set we intend to remove (existing), not the full recorded
    // paths list — missing entries would otherwise dilute/alter the digest.
    const currentHash = await hashInstalledPaths(root, existing)
    if (currentHash !== entry.hash) {
      warn(
        `Former catalog item ${migration.oldId} was modified locally — leaving old paths in place: ${existing.join(', ')}`,
      )
      continue
    }
    for (const rel of existing) {
      const abs = path.join(root, rel)
      if (dryRun) {
        say(
          `[dry-run] would remove renamed ${displayPath(root, abs)} (${migration.oldId} → ${migration.newId})`,
        )
        continue
      }
      await fs.remove(abs)
      await pruneEmptyDir(path.dirname(abs))
    }
  }
}

/**
 * Deletes catalog items installed on a previous run (per the existing lock) that are no
 * longer present in the catalog manifest or are marked deprecated. Only removes on-disk
 * copies whose content still matches the recorded lock hash; user-modified files are
 * preserved with a warning. Items still in the manifest as approved but unselected this
 * run are intentionally left in place.
 */
async function cleanupStaleCatalogItems(
  root: string,
  manifestById: Map<string, CleanupManifestItem>,
  dryRun: boolean,
  quiet?: boolean,
): Promise<void> {
  const say = quiet ? () => {} : log
  const prevLock = await readJson<PrevLockEntry[]>(hausPath(root, 'haus.lock.json'))
  if (!prevLock?.length) return
  for (const entry of prevLock) {
    if (!entry.id) continue
    const manifestItem = manifestById.get(entry.id)
    const removedFromManifest = manifestItem === undefined
    const deprecated = manifestItem?.reviewStatus === 'deprecated'
    if (!removedFromManifest && !deprecated) continue
    const relPaths = entry.paths ?? []
    if (relPaths.length === 0) continue
    const existing: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.join(root, rel))) existing.push(rel)
    }
    if (existing.length === 0) continue
    const pruneReason = deprecated ? 'deprecated' : 'stale'
    if (entry.hash === undefined) {
      warn(
        `${deprecated ? 'Deprecated' : 'Stale'} catalog item ${entry.id} has no lock hash — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    const currentHash = await hashInstalledPaths(root, relPaths)
    if (currentHash !== entry.hash) {
      warn(
        `${deprecated ? 'Deprecated' : 'Stale'} catalog item ${entry.id} was modified locally — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    for (const rel of existing) {
      const abs = path.join(root, rel)
      if (dryRun) {
        say(`[dry-run] would remove ${pruneReason} ${displayPath(root, abs)} (${entry.id})`)
        continue
      }
      await fs.remove(abs)
      await pruneEmptyDir(path.dirname(abs))
      say(`Removed ${pruneReason} ${displayPath(root, abs)} (${entry.id})`)
    }
  }
}

/** Backs up files about to be pruned to `.haus-workflow/backups/prune-<timestamp>/`. */
async function backupBeforePrune(root: string, absPaths: string[]): Promise<void> {
  if (absPaths.length === 0) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = hausPath(root, 'backups', `prune-${stamp}`)
  for (const abs of absPaths) {
    if (!(await fs.pathExists(abs))) continue
    const rel = path.relative(root, abs)
    const backupPath = path.join(backupRoot, rel)
    await fs.ensureDir(path.dirname(backupPath))
    await fs.copy(abs, backupPath)
  }
  log(`Backed up ${absPaths.length} file(s) to ${path.relative(root, backupRoot)} before pruning.`)
}

/**
 * Removes catalog items that are lock-tracked but no longer present in the current
 * recommendation (fell out of eligibility without being removed from the manifest —
 * `haus doctor` only advises on these by default). Opt-in via `haus apply --prune`.
 * Hash-gated exactly like `cleanupStaleCatalogItems`: a locally-modified or
 * hash-less entry is left in place with a warning, never silently deleted. Unlike
 * that automatic cleanup, this is an explicit, user-requested deletion, so removed
 * files are backed up first.
 */
async function pruneOrphanedCatalogItems(
  root: string,
  prevLock: PrevLockEntry[],
  recommendedIds: Set<string>,
  dryRun: boolean,
  quiet?: boolean,
): Promise<void> {
  const say = quiet ? () => {} : log
  const orphaned = findOrphanedLockEntries(prevLock, recommendedIds)
  if (orphaned.length === 0) return

  const toRemove: Array<{ id: string; existing: string[] }> = []
  for (const entry of orphaned) {
    if (!entry.id) continue
    const relPaths = entry.paths ?? []
    if (relPaths.length === 0) continue
    const existing: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.join(root, rel))) existing.push(rel)
    }
    if (existing.length === 0) continue
    if (entry.hash === undefined) {
      warn(
        `Orphaned catalog item ${entry.id} has no lock hash — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    const currentHash = await hashInstalledPaths(root, relPaths)
    if (currentHash !== entry.hash) {
      warn(
        `Orphaned catalog item ${entry.id} was modified locally — leaving in place: ${existing.join(', ')}`,
      )
      continue
    }
    toRemove.push({ id: entry.id, existing })
  }
  if (toRemove.length === 0) return

  if (dryRun) {
    for (const { id, existing } of toRemove) {
      for (const rel of existing) {
        say(`[dry-run] would prune orphaned ${displayPath(root, path.join(root, rel))} (${id})`)
      }
    }
    return
  }

  const allAbsPaths = toRemove.flatMap(({ existing }) =>
    existing.map((rel) => path.join(root, rel)),
  )
  await backupBeforePrune(root, allAbsPaths)
  for (const { id, existing } of toRemove) {
    for (const rel of existing) {
      const abs = path.join(root, rel)
      await fs.remove(abs)
      await pruneEmptyDir(path.dirname(abs))
      say(`Pruned orphaned ${displayPath(root, abs)} (${id})`)
    }
  }
}
