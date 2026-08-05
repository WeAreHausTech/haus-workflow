/**
 * Per-member hydration: step 1 (CoW clone of hydration targets) then step 2
 * (install-reconciliation against the branch's own lockfile). See
 * docs/plans/workspace-worktree-materialization.md — Task 4.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { cowCopyDir, type CowCopyResult } from './cow-copy.js'
import {
  computeLockfileSignals,
  detectInstallPlan,
  runInstallPlan,
  type InstallRunResult,
} from './install.js'

/** Directories worth CoW-cloning ahead of install-reconciliation, across the supported ecosystems. */
export const HYDRATION_TARGETS = ['node_modules', 'vendor', 'obj', 'bin'] as const

export type HydrationResult = {
  targets: Array<{ target: string; copy: CowCopyResult }>
  install: InstallRunResult
  durationMs: number
}

/**
 * Hydrate one member worktree: CoW-clone any hydration targets present in the
 * main checkout, then run install-reconciliation. A copy failure is recorded but
 * never fatal — hydration always proceeds to the install step regardless.
 *
 * @param opts.force - Re-clone a target even if it already exists at the
 *   destination (used by `haus workspace worktree hydrate --force`). Without it,
 *   an existing destination is treated as "already hydrated" and left alone.
 */
export async function hydrateMember(
  mainMemberPath: string,
  worktreeMemberPath: string,
  opts: { force?: boolean } = {},
): Promise<HydrationResult> {
  const start = Date.now()
  const targets: HydrationResult['targets'] = []
  for (const target of HYDRATION_TARGETS) {
    const src = path.join(mainMemberPath, target)
    const dest = path.join(worktreeMemberPath, target)
    if (!(await fs.pathExists(src))) continue
    if (!opts.force && (await fs.pathExists(dest))) continue
    const copy = await cowCopyDir(src, dest)
    targets.push({ target, copy })
  }

  const signals = await computeLockfileSignals(worktreeMemberPath)
  const plan = detectInstallPlan(signals)
  const install = await runInstallPlan(worktreeMemberPath, plan)

  return { targets, install, durationMs: Date.now() - start }
}
