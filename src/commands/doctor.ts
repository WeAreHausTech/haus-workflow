/** `haus doctor` — validates project setup: hooks contract, managed files, cache freshness, and CLI version. */
import path from 'node:path'

import fs from 'fs-extra'

import { CACHE_DIR, getCacheManifestAge } from '../catalog/remote-catalog.js'
import { isHookEnabled, type HookKey } from '../claude/load-hooks-config.js'
import { normaliseLF } from '../claude/managed-template.js'
import { verifyProjectSettingsHooksContract } from '../claude/verify-hooks-contract.js'
import { BLOCK_BEGIN } from '../claude/write-root-claude-md.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { fetchNpmVersionStatus, NPM_PACKAGE_NAME } from '../update/npm-version.js'
import { hashText, readJson, readText } from '../utils/fs.js'
import { error, log, warn } from '../utils/logger.js'
import { hausPath, packageRoot } from '../utils/paths.js'

/**
 * Runs a health check on the current project's Haus AI setup.
 * With --hooks, only validates the Claude Code hooks contract and exits.
 */
export async function runDoctor(options?: { hooks?: boolean }): Promise<void> {
  const root = process.cwd()

  if (options?.hooks) {
    const hooks = await verifyProjectSettingsHooksContract(root)
    if (hooks.skipped) {
      error(`Haus doctor --hooks: ${hooks.message}`)
      process.exitCode = 1
      return
    }
    if (!hooks.ok) {
      error(`Haus doctor --hooks: ${hooks.message}`)
      process.exitCode = 1
      return
    }
    log(`Haus doctor --hooks: ${hooks.message}`)
    return
  }

  const context = await readContextOrScan(root)
  const recommendation = await readJson<{ recommended: unknown[]; warnings: string[] }>(
    hausPath(root, 'recommendation.json'),
  )
  log('Haus Doctor')
  log(`Repo: ${context.repoName}`)
  log(`Roles: ${context.repoRoles.join(', ') || 'unknown'}`)
  log(`Package manager: ${context.packageManager}`)
  log(`Recommended items: ${recommendation?.recommended?.length ?? 0}`)
  const warningLines = [...new Set([...context.warnings, ...(recommendation?.warnings ?? [])])]
  for (const warning of warningLines) {
    log(`- WARN: ${warning}`)
  }

  const hooks = await verifyProjectSettingsHooksContract(root)
  if (hooks.skipped) {
    log(`- HOOKS: (skipped) ${hooks.message}`)
  } else if (!hooks.ok) {
    log(`- HOOKS FAIL: ${hooks.message}`)
    process.exitCode = 1
  } else {
    log(`- HOOKS OK: ${hooks.message}`)
  }

  // Per-hook gate state (P2 outcome). Guards are always on; only the
  // gated UserPromptSubmit hooks have an opt-in flag.
  const gatedHooks: HookKey[] = ['context', 'memoryInject']
  for (const key of gatedHooks) {
    const enabled = await isHookEnabled(root, key)
    log(`- HOOK ${key}: ${enabled ? 'enabled' : 'disabled (default)'}`)
  }

  // P6: validate root CLAUDE.md import block and managed files.
  const rootClaudeMdPath = path.join(root, 'CLAUDE.md')
  const rootClaudeMdContent = await readText(rootClaudeMdPath)
  if (!rootClaudeMdContent) {
    warn('- CLAUDE.md: missing (run `haus apply --write` to create)')
  } else if (!rootClaudeMdContent.includes(BLOCK_BEGIN)) {
    warn('- CLAUDE.md: haus import block missing (run `haus apply --write` to add)')
  } else {
    log('- CLAUDE.md: import block present')
  }

  const workflowPath = hausPath(root, 'WORKFLOW.md')
  const workflowExists = await fs.pathExists(workflowPath)
  if (!workflowExists) {
    warn('- .haus-workflow/WORKFLOW.md: missing (run `haus apply --write`)')
  } else {
    const workflowContent = await readText(workflowPath)
    const firstLine = workflowContent?.split('\n')[0] ?? ''
    if (!firstLine.includes('HAUS-MANAGED')) {
      log('- .haus-workflow/WORKFLOW.md: OK (user-owned)')
    } else {
      // Compare installed template hash against current template — prefer catalog cache (same as writeWorkflow).
      const storedHashMatch = firstLine.match(/hash=(sha256-[a-f0-9]+)/)
      const cachePath = path.join(CACHE_DIR, 'templates/agentic-workflow-standard.md')
      const bundledPath = path.join(
        packageRoot(),
        'library',
        'global',
        'templates',
        'agentic-workflow-standard.md',
      )
      const templatePath = (await fs.pathExists(cachePath)) ? cachePath : bundledPath
      const templateContent = await readText(templatePath)
      if (storedHashMatch && templateContent) {
        const currentHash = hashText(normaliseLF(templateContent))
        if (storedHashMatch[1] !== currentHash) {
          warn('- .haus-workflow/WORKFLOW.md: stale (template updated — run `haus apply --write`)')
        } else {
          log('- .haus-workflow/WORKFLOW.md: OK')
        }
      } else {
        log('- .haus-workflow/WORKFLOW.md: OK')
      }
    }
  }

  const workflowConfigPath = hausPath(root, 'workflow-config.md')
  const workflowConfigExists = await fs.pathExists(workflowConfigPath)
  if (!workflowConfigExists) {
    warn('- .haus-workflow/workflow-config.md: missing (run `haus apply --write`)')
  } else {
    const cfg = await fs.readFile(workflowConfigPath, 'utf8')
    const unfilled = cfg.split('\n').filter((l) => l.includes('<!-- fill in')).length
    if (unfilled > 0) {
      warn(
        `- .haus-workflow/workflow-config.md: ${unfilled} field(s) still unfilled (run \`haus apply --refill-config\` to auto-fill detectable ones)`,
      )
    } else {
      log('- .haus-workflow/workflow-config.md: OK (project-owned)')
    }
  }

  const projectMdPath = hausPath(root, 'project.md')
  const projectMdExists = await fs.pathExists(projectMdPath)
  if (!projectMdExists) {
    warn('- .haus-workflow/project.md: missing (run `haus apply --write`)')
  } else {
    const projectMdContent = await readText(projectMdPath)
    const hasHeader = projectMdContent?.split('\n')[0]?.includes('HAUS-MANAGED') ?? false
    if (!hasHeader) {
      warn('- .haus-workflow/project.md: no HAUS-MANAGED header (user-owned)')
    } else {
      log('- .haus-workflow/project.md: OK')
    }
  }

  const cacheAgeMs = await getCacheManifestAge()
  if (cacheAgeMs === null) {
    warn('- CATALOG CACHE: absent (run `haus update` to populate)')
  } else {
    const cacheAgeDays = Math.floor(cacheAgeMs / (1000 * 60 * 60 * 24))
    if (cacheAgeDays >= 7) {
      warn(`- CATALOG CACHE: stale (${cacheAgeDays}d old — run \`haus update\`)`)
    } else {
      log(`- CATALOG CACHE: OK (${cacheAgeDays}d old)`)
    }
  }

  const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
  const currentVersion = pkgJson?.version ?? '0.0.0'
  const npmStatus = await fetchNpmVersionStatus(currentVersion)
  if (npmStatus.updateAvailable && npmStatus.latest !== null) {
    warn(
      `- CLI UPDATE: ${currentVersion} → ${npmStatus.latest} available (run: npm install -g ${NPM_PACKAGE_NAME})`,
    )
    process.exitCode = 1
  } else if (npmStatus.latest !== null) {
    log(`- CLI: ${currentVersion} (up to date)`)
  } else {
    log(`- CLI: ${currentVersion} (version check unavailable)`)
  }
}
