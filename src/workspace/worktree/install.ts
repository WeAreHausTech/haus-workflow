/**
 * Install-reconciliation — step 2 of hydration, run against the *branch's own*
 * lockfile after the CoW clone (step 1) lands. `detectInstallPlan` is a pure
 * function over pre-computed signals (no filesystem or process access) so the
 * lockfile -> command dispatch table itself is unit-testable without actually
 * running any installer. See docs/plans/workspace-worktree-materialization.md —
 * Task 4 hydration table.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'

import { commandExists, runCommand } from '../../utils/exec.js'

export type LockfileSignals = {
  hasYarnLock: boolean
  /** Whether package.json carries a `packageManager` field (corepack needs this). */
  hasPackageManagerField: boolean
  hasPnpmLock: boolean
  hasPackageLock: boolean
  hasComposerLock: boolean
  /** Any `*.csproj` or `*.sln` present. */
  hasDotnetProject: boolean
}

export type InstallPlan =
  | { manager: 'yarn'; command: 'corepack'; args: string[] }
  | { manager: 'yarn'; command: 'yarn'; args: string[] }
  | { manager: 'pnpm'; command: 'pnpm'; args: string[] }
  | { manager: 'npm'; command: 'npm'; args: string[] }
  | { manager: 'composer'; command: 'composer'; args: string[] }
  | { manager: 'dotnet'; command: 'dotnet'; args: string[] }
  | { manager: 'none' }

/**
 * Pure lockfile -> install-command dispatch. Priority order matches the plan
 * doc's table (yarn, pnpm, npm, composer, dotnet); a repo with more than one
 * lockfile present (unusual) picks the first match in that order.
 *
 * Deliberately never `npm ci` for `package-lock.json` — `npm ci` deletes
 * `node_modules` before installing, which would defeat the CoW clone step
 * entirely (plan doc Task 4 pitfall #2). Deliberately never `--immutable` for
 * yarn — the branch may legitimately carry a different lockfile than whatever
 * was last installed.
 */
export function detectInstallPlan(signals: LockfileSignals): InstallPlan {
  if (signals.hasYarnLock) {
    return signals.hasPackageManagerField
      ? { manager: 'yarn', command: 'corepack', args: ['yarn', 'install'] }
      : { manager: 'yarn', command: 'yarn', args: ['install'] }
  }
  if (signals.hasPnpmLock) {
    return { manager: 'pnpm', command: 'pnpm', args: ['install', '--frozen-lockfile'] }
  }
  if (signals.hasPackageLock) {
    return { manager: 'npm', command: 'npm', args: ['install'] }
  }
  if (signals.hasComposerLock) {
    return { manager: 'composer', command: 'composer', args: ['install'] }
  }
  if (signals.hasDotnetProject) {
    return { manager: 'dotnet', command: 'dotnet', args: ['restore'] }
  }
  return { manager: 'none' }
}

/** Reads the on-disk signals `detectInstallPlan` needs, for a single member worktree dir. */
export async function computeLockfileSignals(dir: string): Promise<LockfileSignals> {
  const hasYarnLock = existsSync(path.join(dir, 'yarn.lock'))
  const hasPnpmLock = existsSync(path.join(dir, 'pnpm-lock.yaml'))
  const hasPackageLock = existsSync(path.join(dir, 'package-lock.json'))
  const hasComposerLock = existsSync(path.join(dir, 'composer.lock'))
  const dotnetFiles = await fg(['*.csproj', '*.sln'], {
    cwd: dir,
    onlyFiles: true,
    suppressErrors: true,
  })
  const hasDotnetProject = dotnetFiles.length > 0

  let hasPackageManagerField = false
  const pkgPath = path.join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { packageManager?: unknown }
      hasPackageManagerField =
        typeof pkg.packageManager === 'string' && pkg.packageManager.length > 0
    } catch {
      /* malformed package.json — treat as no packageManager field */
    }
  }

  return {
    hasYarnLock,
    hasPackageManagerField,
    hasPnpmLock,
    hasPackageLock,
    hasComposerLock,
    hasDotnetProject,
  }
}

export type InstallRunResult = {
  plan: InstallPlan
  ran: boolean
  ok: boolean
  exitCode?: number
  stderr?: string
  skippedReason?: string
}

/** Executes an {@link InstallPlan}, skipping (not failing) when the tool isn't on PATH. */
export async function runInstallPlan(dir: string, plan: InstallPlan): Promise<InstallRunResult> {
  if (plan.manager === 'none') {
    return { plan, ran: false, ok: true, skippedReason: 'no recognized lockfile' }
  }
  const available = await commandExists(plan.command)
  if (!available) {
    // Skipped, not failed — matches this function's own doc comment. Callers
    // branch on `ran` before ever reading `ok` (see describeInstall() in
    // src/commands/workspace/worktree.ts), but `ok: true` here keeps that
    // contract honest for any future caller that reads `ok` on its own.
    return { plan, ran: false, ok: true, skippedReason: `${plan.command} not found on PATH` }
  }
  const result = await runCommand(plan.command, plan.args, { cwd: dir })
  return {
    plan,
    ran: true,
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stderr: result.exitCode === 0 ? undefined : result.stderr,
  }
}
