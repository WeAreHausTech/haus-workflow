/**
 * Orchestrates writing all .claude/ outputs: settings, rules, commands, catalog items, and lock.
 * Uses a diff-first approach — only writes when content has actually changed.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { CATALOG_REF } from '../catalog/constants.js'
import { CACHE_DIR } from '../catalog/remote-catalog.js'
import type { Recommendation } from '../types.js'
import { hashInstalledPaths } from '../update/hash-installed.js'
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { readJson, writeText } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { claudePath, displayPath, hausPath, packageRoot } from '../utils/paths.js'

import { DEFAULT_HOOKS_CONFIG } from './load-hooks-config.js'
import { loadClaudeHooksSettings } from './load-hooks.js'
import { assertPostApplySettingsMatchCanonical } from './verify-hooks-contract.js'
import { writeRootClaudeMd } from './write-root-claude-md.js'
import { writeWorkflowConfig } from './write-workflow-config.js'
import { writeWorkflow } from './write-workflow.js'

/**
 * Write all managed .claude/ files for the project at `root`.
 * In dry-run mode, logs diffs but does not write anything to disk.
 * Returns the full set of file paths that were written (or would be written).
 */
export async function writeClaudeFiles(
  root: string,
  dryRun: boolean,
  selectedIds?: string[],
  opts: { refillConfig?: boolean } = {},
): Promise<string[]> {
  const rec = (await readJson<Recommendation>(hausPath(root, 'recommendation.json'))) ?? {
    mode: 'fast',
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

  // Lock and selected-context are only written during actual apply, not dry-run.
  const coreFiles = [
    claudePath(root, 'settings.json'),
    claudePath(root, 'rules', 'haus.md'),
    claudePath(root, 'rules', 'security.md'),
    claudePath(root, 'commands', 'haus-doctor.md'),
    claudePath(root, 'commands', 'haus-review.md'),
  ]
  const rootClaudeMdPath = await writeRootClaudeMd(root, dryRun)
  const workflowPath = await writeWorkflow(root, hausVersion, dryRun)
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
    : [
        ...coreFiles,
        ...p6Files,
        hausPath(root, 'selected-context.json'),
        hausPath(root, 'haus.lock.json'),
      ]
  const hookSettings = await loadClaudeHooksSettings()
  await writeManagedJson(root, claudePath(root, 'settings.json'), hookSettings, dryRun)
  if (!dryRun) await assertPostApplySettingsMatchCanonical(root, hookSettings)
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
  await writeManagedText(
    root,
    claudePath(root, 'commands', 'haus-review.md'),
    'Run `haus context --task "code review"` then review diff.',
    dryRun,
  )
  await writeManagedText(
    root,
    claudePath(root, 'rules', 'haus.md'),
    '- Keep context minimal.\n' +
      '- Follow project conventions.\n' +
      '\n' +
      '## Driving haus\n' +
      'When the user asks to set up, configure, check, or fix the project, run ' +
      '`haus setup-project` or `haus doctor` and narrate results in plain language — ' +
      'never make them use a terminal or read JSON. The `/haus-setup`, `/haus-doctor`, ' +
      'and `/haus-fix` commands do the same.\n',
    dryRun,
  )
  await writeManagedText(
    root,
    claudePath(root, 'rules', 'security.md'),
    '- Never read secrets.\n- Block dangerous shell commands.\n',
    dryRun,
  )

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
  const fixtureManifestPath = process.env['HAUS_FIXTURE_CATALOG']
  const manifestPath =
    fixtureManifestPath ?? path.join(pkgRoot, 'library', 'catalog', 'manifest.json')
  const manifestDir = path.dirname(manifestPath)
  const manifest = (await readJson<{ items?: ManifestItem[] }>(manifestPath)) ?? { items: [] }
  const manifestById = new Map((manifest.items ?? []).map((item) => [item.id, item]))
  // Catalog manifests use paths relative to the manifest's own directory.
  // Cache manifest in CACHE_DIR, bundled in library/catalog, fixture in tests/fixtures/catalog —
  // all resolve via `path.join(<dir-of-manifest>, item.path)`.
  const cacheManifest = await readJson<{ items?: ManifestItem[] }>(
    path.join(CACHE_DIR, 'manifest.json'),
  )
  const cacheManifestById = new Map((cacheManifest?.items ?? []).map((item) => [item.id, item]))
  const installedPathsByItem = new Map<string, string[]>()
  // Track which recommended items were actually installed so that skipped
  // curated items (unapproved or blocked) are excluded from the lock and
  // selected-context output — a stale recommendation.json must not cause
  // unapproved artifacts to appear in the written state.
  const installedIds = new Set<string>()

  const catalogItems =
    selectedIds !== undefined
      ? rec.recommended.filter((r) => selectedIds.includes(r.id))
      : rec.recommended

  for (const item of catalogItems) {
    const manifestItem = manifestById.get(item.id)
    if (!manifestItem?.path) continue
    // Curated items must be approved and not blocked before they are written to disk.
    if (manifestItem.source === 'curated') {
      if (manifestItem.reviewStatus !== 'approved') {
        warn(
          `Skipping curated item ${item.id}: reviewStatus is not approved (${manifestItem.reviewStatus ?? 'unset'})`,
        )
        continue
      }
      if (manifestItem.riskLevel === 'blocked') {
        warn(`Skipping curated item ${item.id}: riskLevel is blocked`)
        continue
      }
    }
    const cachedItem = cacheManifestById.get(item.id)
    const cachePath = cachedItem?.path ? path.join(CACHE_DIR, cachedItem.path) : null
    const sourcePath =
      cachePath && (await fs.pathExists(cachePath))
        ? cachePath
        : path.join(manifestDir, manifestItem.path)
    const target =
      item.type === 'agent' ? 'agents' : item.type === 'template' ? 'templates' : 'skills'
    const destination = claudePath(root, target, path.basename(sourcePath))
    if (await fs.pathExists(sourcePath)) {
      if (dryRun) {
        const exists = await fs.pathExists(destination)
        log(
          `${displayPath(root, destination)}: ${exists ? 'would overwrite' : 'would create'} (${item.id})`,
        )
      } else {
        await fs.ensureDir(path.dirname(destination))
        await fs.copy(sourcePath, destination, { overwrite: true, errorOnExist: false })
      }
      files.push(destination)
      const current = installedPathsByItem.get(item.id) ?? []
      installedPathsByItem.set(item.id, [...current, path.relative(root, destination)])
      installedIds.add(item.id)
    } else {
      warn(
        `Skipping ${item.id}: source not found at ${sourcePath} — run \`haus update\` to populate catalog cache`,
      )
    }
  }

  if (dryRun) return [...new Set(files)]

  const installedItems = catalogItems.filter((r) => installedIds.has(r.id))
  await writeManagedJson(
    root,
    hausPath(root, 'selected-context.json'),
    installedItems.map((r) => ({
      id: r.id,
      type: r.type,
      reason: r.reason,
      selectionMode: r.selectionMode,
    })),
    false,
  )
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
        catalogRef: CATALOG_REF,
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

/** Write a text file only when content has changed; in dry-run mode, log the diff instead. */
async function writeManagedText(
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
async function writeManagedJson(
  root: string,
  filePath: string,
  value: unknown,
  dryRun: boolean,
): Promise<void> {
  const nextText = `${JSON.stringify(value, null, 2)}\n`
  await writeManagedText(root, filePath, nextText, dryRun)
}
