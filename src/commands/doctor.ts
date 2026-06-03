/** `haus doctor` — validates project setup: hooks contract, managed files, cache freshness, and CLI version. */
import path from 'node:path'

import fs from 'fs-extra'

import { CACHE_DIR, getCacheManifestAge } from '../catalog/remote-catalog.js'
import { isHookEnabled, type HookKey } from '../claude/load-hooks-config.js'
import { normaliseLF } from '../claude/managed-template.js'
import { verifyProjectSettingsHooksContract } from '../claude/verify-hooks-contract.js'
import { BLOCK_BEGIN, BLOCK_END } from '../claude/write-root-claude-md.js'
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

  // Detail lines are buffered (preserving their log/warn stream) so the
  // plain-language verdict can be printed FIRST, above the developer detail.
  // Each thing that needs attention also records a one-sentence summary + the
  // exact fix command, which a non-dev (or the agent narrating to them) reads.
  const detail: Array<{ stream: 'log' | 'warn'; text: string }> = []
  const attention: Array<{ sentence: string; fix: string }> = []
  const ok = (text: string) => detail.push({ stream: 'log', text })
  const flag = (text: string, sentence: string, fix: string) => {
    detail.push({ stream: 'warn', text })
    attention.push({ sentence, fix })
  }

  ok(`Repo: ${context.repoName}`)
  ok(`Roles: ${context.repoRoles.join(', ') || 'unknown'}`)
  ok(`Package manager: ${context.packageManager}`)
  ok(`Recommended items: ${recommendation?.recommended?.length ?? 0}`)
  const warningLines = [...new Set([...context.warnings, ...(recommendation?.warnings ?? [])])]
  for (const warning of warningLines) {
    ok(`- WARN: ${warning}`)
  }

  const hooks = await verifyProjectSettingsHooksContract(root)
  if (hooks.skipped) {
    ok(`- HOOKS: (skipped) ${hooks.message}`)
  } else if (!hooks.ok) {
    flag(
      `- HOOKS FAIL: ${hooks.message}`,
      "The Claude Code hooks don't match what haus expects",
      'haus apply --write',
    )
    process.exitCode = 1
  } else {
    ok(`- HOOKS OK: ${hooks.message}`)
  }

  // Per-hook gate state (P2 outcome). Guards are always on; only the
  // gated UserPromptSubmit hooks have an opt-in flag.
  const gatedHooks: HookKey[] = ['context']
  for (const key of gatedHooks) {
    const enabled = await isHookEnabled(root, key)
    ok(`- HOOK ${key}: ${enabled ? 'enabled' : 'disabled (default)'}`)
  }

  // P6 / WS9: validate root CLAUDE.md import block AND that each @-imported
  // target resolves — the import block is the sole bridge that pulls
  // .haus-workflow/* into Claude Code's context, so a broken link silently
  // drops those files.
  const rootClaudeMdPath = path.join(root, 'CLAUDE.md')
  const rootClaudeMdContent = await readText(rootClaudeMdPath)
  if (!rootClaudeMdContent) {
    flag(
      '- CLAUDE.md: missing (run `haus apply --write` to create)',
      "Your project's CLAUDE.md is missing, so haus guidance never loads",
      'haus apply --write',
    )
  } else if (!rootClaudeMdContent.includes(BLOCK_BEGIN)) {
    flag(
      '- CLAUDE.md: haus import block missing (run `haus apply --write` to add)',
      'The haus import block is missing from CLAUDE.md, so its guidance never loads',
      'haus apply --write',
    )
  } else {
    const beginIdx = rootClaudeMdContent.indexOf(BLOCK_BEGIN)
    // Search for END *after* BEGIN so unrelated earlier text can't satisfy the close.
    const endIdx = rootClaudeMdContent.indexOf(BLOCK_END, beginIdx + BLOCK_BEGIN.length)
    if (endIdx < 0) {
      // BEGIN without a matching END: the block is malformed, not a clean bridge.
      // Don't scan to EOF (that would capture @-imports in the user's own notes).
      flag(
        '- CLAUDE.md: haus import block is not closed (run `haus apply --write` to repair)',
        'The haus import block in CLAUDE.md is broken, so its guidance may not load',
        'haus apply --write',
      )
    } else {
      ok('- CLAUDE.md: import block present')
      const block = rootClaudeMdContent.slice(beginIdx, endIdx + BLOCK_END.length)
      const importTargets = [...block.matchAll(/@\.haus-workflow\/(\S+)/g)].map((m) => m[1])
      for (const target of importTargets) {
        if (!(await fs.pathExists(hausPath(root, target)))) {
          flag(
            `- CLAUDE.md import: @.haus-workflow/${target} does not resolve (run \`haus apply --write\`)`,
            `A file CLAUDE.md links to (${target}) is missing, so part of the guidance won't load`,
            'haus apply --write',
          )
        }
      }
    }
  }

  const workflowPath = hausPath(root, 'WORKFLOW.md')
  const workflowExists = await fs.pathExists(workflowPath)
  if (!workflowExists) {
    flag(
      '- .haus-workflow/WORKFLOW.md: missing (run `haus apply --write`)',
      'The workflow standard file is missing',
      'haus apply --write',
    )
  } else {
    const workflowContent = await readText(workflowPath)
    const firstLine = workflowContent?.split('\n')[0] ?? ''
    if (!firstLine.includes('HAUS-MANAGED')) {
      ok('- .haus-workflow/WORKFLOW.md: OK (user-owned)')
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
          flag(
            '- .haus-workflow/WORKFLOW.md: stale (template updated — run `haus apply --write`)',
            'The workflow standard is out of date',
            'haus apply --write',
          )
        } else {
          ok('- .haus-workflow/WORKFLOW.md: OK')
        }
      } else {
        ok('- .haus-workflow/WORKFLOW.md: OK')
      }
    }
  }

  const workflowConfigPath = hausPath(root, 'workflow-config.md')
  const workflowConfigExists = await fs.pathExists(workflowConfigPath)
  if (!workflowConfigExists) {
    flag(
      '- .haus-workflow/workflow-config.md: missing (run `haus apply --write`)',
      'The workflow config file is missing',
      'haus apply --write',
    )
  } else {
    const cfg = await fs.readFile(workflowConfigPath, 'utf8')
    const unfilled = cfg.split('\n').filter((l) => l.includes('<!-- fill in')).length
    if (unfilled > 0) {
      flag(
        `- .haus-workflow/workflow-config.md: ${unfilled} field(s) still unfilled (run \`haus apply --refill-config\` to auto-fill detectable ones)`,
        `${unfilled} workflow-config field(s) are still blank`,
        'haus apply --refill-config',
      )
    } else {
      ok('- .haus-workflow/workflow-config.md: OK (project-owned)')
    }
  }

  const cacheAgeMs = await getCacheManifestAge()
  if (cacheAgeMs === null) {
    flag(
      '- CATALOG CACHE: absent (run `haus update` to populate)',
      "The catalog cache hasn't been downloaded yet",
      'haus update',
    )
  } else {
    const cacheAgeDays = Math.floor(cacheAgeMs / (1000 * 60 * 60 * 24))
    if (cacheAgeDays >= 7) {
      flag(
        `- CATALOG CACHE: stale (${cacheAgeDays}d old — run \`haus update\`)`,
        `The catalog cache is ${cacheAgeDays} days old`,
        'haus update',
      )
    } else {
      ok(`- CATALOG CACHE: OK (${cacheAgeDays}d old)`)
    }
  }

  const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
  const currentVersion = pkgJson?.version ?? '0.0.0'
  const npmStatus = await fetchNpmVersionStatus(currentVersion)
  if (npmStatus.updateAvailable && npmStatus.latest !== null) {
    flag(
      `- CLI UPDATE: ${currentVersion} → ${npmStatus.latest} available (run: npm install -g ${NPM_PACKAGE_NAME})`,
      `A newer haus (${npmStatus.latest}) is available`,
      `npm install -g ${NPM_PACKAGE_NAME}`,
    )
    process.exitCode = 1
  } else if (npmStatus.latest !== null) {
    ok(`- CLI: ${currentVersion} (up to date)`)
  } else {
    ok(`- CLI: ${currentVersion} (version check unavailable)`)
  }

  // The very first line is the plain-language verdict (the only line a non-dev
  // needs); the "Haus Doctor" title and developer detail follow beneath.
  if (attention.length === 0) {
    log('✅ Your project is set up and healthy.')
  } else {
    log(`⚠️ ${attention.length} thing(s) need attention:`)
    for (const a of attention) log(`  • ${a.sentence} — fix: ${a.fix}`)
  }
  log('Haus Doctor')
  for (const line of detail) {
    if (line.stream === 'warn') warn(line.text)
    else log(line.text)
  }
}
