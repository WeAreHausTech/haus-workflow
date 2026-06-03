/**
 * Infers project-specific workflow-config values from the repo, so the generated
 * workflow-config.md ships real commands instead of "fill in" placeholders.
 *
 * Script-first: a real package.json script always wins. Only when no script exists does
 * it reconstruct a command from a present dependency/config (never guesses a tool that
 * isn't installed). Genuinely un-inferable fields (highest-stakes logic) stay null so the
 * writer emits an honest placeholder rather than a wrong guess.
 */

import path from 'node:path'

import fs from 'fs-extra'

import type { ContextMap, PackageManager } from '../types.js'
import { readJson } from '../utils/fs.js'

/**
 * Resolved workflow-config values bound by the workflow methodology. `null` = not
 * inferable → writer emits a placeholder. Everyday dev commands (lint, typecheck,
 * format, build) are owned by CLAUDE.md/docs (the writing-documentation skill), not here.
 */
export interface WorkflowConfigValues {
  test: string
  testE2E: string | null
  preCommitTool: string | null
  specPath: string | null
  designPath: string | null
  uxPath: string | null
}

/** Formats a node-bin invocation appropriate to the package manager. */
function binCmd(pm: PackageManager, bin: string, args: string): string {
  const tail = args ? ` ${args}` : ''
  if (pm === 'yarn') return `yarn ${bin}${tail}`
  if (pm === 'pnpm') return `pnpm exec ${bin}${tail}`
  // --no-install: run only the locally-installed bin, never fetch from the registry
  // (matches "don't guess tools that aren't installed" + airgap/supply-chain safety).
  return `npx --no-install ${bin}${tail}` // npm / unknown
}

/**
 * Derives workflow-config values for the repo at `root`. Reads package.json scripts and
 * checks for config files; falls back to the ContextMap's dependency list for tool presence.
 */
export async function deriveWorkflowConfig(
  root: string,
  ctx: ContextMap,
): Promise<WorkflowConfigValues> {
  const pm: PackageManager = ctx.packageManager === 'unknown' ? 'npm' : ctx.packageManager
  const pkg = await readJson<{ scripts?: Record<string, string> }>(path.join(root, 'package.json'))
  const scripts = pkg?.scripts ?? {}
  const deps = new Set(ctx.dependencies)
  const stacks = Object.values(ctx.detectedStacks ?? {}).flat()

  const script = (name: string): string | null => (scripts[name] ? `${pm} run ${name}` : null)
  const firstScript = (...names: string[]): string | null => {
    for (const n of names) if (scripts[n]) return `${pm} run ${n}`
    return null
  }
  const hasDep = (name: string): boolean => deps.has(name)
  const exists = (rel: string): boolean => fs.pathExistsSync(path.join(root, rel))

  const hasPlaywright = hasDep('@playwright/test') || stacks.includes('playwright')
  const hasCypress = hasDep('cypress')

  const preCommitTool =
    exists('lefthook.yml') || exists('lefthook.yaml')
      ? 'lefthook'
      : exists('.husky') || hasDep('husky') || (scripts.prepare ?? '').includes('husky')
        ? 'husky'
        : exists('.pre-commit-config.yaml')
          ? 'pre-commit (Python framework)'
          : null

  return {
    test: script('test') ?? `${pm} test`,
    testE2E:
      firstScript('test:e2e', 'e2e', 'test:integration') ??
      (hasPlaywright ? binCmd(pm, 'playwright', 'test') : null) ??
      (hasCypress ? binCmd(pm, 'cypress', 'run') : null),
    preCommitTool,
    specPath: exists('docs/SPEC.md') ? 'docs/SPEC.md' : null,
    designPath: exists('docs/DESIGN.md') ? 'docs/DESIGN.md' : null,
    uxPath: exists('docs/UX.md') ? 'docs/UX.md' : null,
  }
}
