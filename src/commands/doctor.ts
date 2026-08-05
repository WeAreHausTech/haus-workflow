/** `haus doctor` — validates project setup: hooks contract, managed files, cache freshness, and CLI version. */
import path from 'node:path'

import fs from 'fs-extra'

import { getCacheDir, getCacheManifestAge } from '../catalog/remote-catalog.js'
import { checkManagedTamper } from '../claude/managed-tamper.js'
import { verifyProjectSettingsHooksContract } from '../claude/verify-hooks-contract.js'
import { listTrackedArtifactPaths } from '../claude/write-gitignore.js'
import { IGNORED_PATHS, prettierIgnoreProtects } from '../claude/write-prettierignore.js'
import { BLOCK_BEGIN, BLOCK_END } from '../claude/write-root-claude-md.js'
import { auditDecisionsLayout } from '../decisions/doctor.js'
import { findOrphanedLockEntries } from '../recommender/orphaned-items.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { fetchNpmVersionStatus, NPM_PACKAGE_NAME } from '../update/npm-version.js'
import { runGit } from '../utils/exec.js'
import { readJson, readText } from '../utils/fs.js'
import { error, log, warn } from '../utils/logger.js'
import { hausPath, packageRoot } from '../utils/paths.js'

/**
 * Repo-relative paths of haus-owned, git-*tracked* content (skills/agents under
 * `.claude/`, plus `.haus-workflow/` itself — WORKFLOW.md, workflow-config.md, etc.)
 * that must never be gitignored. This is the opposite concern from
 * `write-gitignore.ts`'s `GITIGNORED_ARTIFACT_PATHS` (machine-local *scan artifacts*
 * that must stay untracked): if any of these come back ignored instead, an entire
 * catalog install becomes invisible to anything relying on git-tracked state — the
 * reporter's actual failure mode (80 skills written, none visible). See Task 1.3 (D5)
 * in docs/plans/workspace-detection-and-permissions-fixes.md.
 */
export const HAUS_OWNED_TRACKED_PATHS = [
  '.claude',
  '.claude/skills',
  '.claude/agents',
  '.haus-workflow',
] as const

/**
 * Repo-relative paths (among `HAUS_OWNED_TRACKED_PATHS`) currently covered by a
 * `.gitignore` rule at `root`, via `git check-ignore`. Returns an empty array — never
 * throws — when `root` isn't a git repository, git is unavailable, or the check
 * errors/times out; callers treat that the same as "nothing ignored" rather than
 * surfacing a spurious failure for an orthogonal git problem.
 */
export async function findGitignoredHausPaths(root: string): Promise<string[]> {
  try {
    const result = await runGit(['check-ignore', '--', ...HAUS_OWNED_TRACKED_PATHS], {
      cwd: root,
      timeout: 5000,
    })
    // check-ignore exits 0 when at least one of the given paths is ignored, 1 when
    // none are — both are normal outcomes. Anything else (128 = not a repo/fatal
    // error) means the check didn't run meaningfully; treat as "nothing ignored".
    if (result.exitCode !== 0 && result.exitCode !== 1) return []
    return [
      ...new Set(
        result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ]
  } catch {
    return []
  }
}

/** Collapse raw ignored `HAUS_OWNED_TRACKED_PATHS` matches into their top-level dirs
 * (`.claude/` and/or `.haus-workflow/`) for a readable warning. */
function summarizeGitignoredHausDirs(paths: string[]): string[] {
  const dirs = new Set<string>()
  for (const p of paths) dirs.add(p === '.haus-workflow' ? '.haus-workflow/' : '.claude/')
  return [...dirs]
}

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
  // Findings split two ways:
  //  - `flag()`   → a BLOCKING problem: setup is broken/incomplete (missing or
  //                 tampered managed files, hooks not installed, broken imports).
  //                 Drives the ⚠️ verdict AND a non-zero exit code so CI can gate.
  //  - `suggest()`→ an ADVISORY notice: setup works but something could be improved
  //                 (config fields to fill, stale catalog cache, a newer CLI). Shown
  //                 separately and never fails the exit code — these are expected
  //                 immediately after `apply` and must not break `doctor &&` chains.
  const detail: Array<{ stream: 'log' | 'warn'; text: string }> = []
  const attention: Array<{ sentence: string; fix: string }> = []
  const suggestions: Array<{ sentence: string; fix: string }> = []
  const ok = (text: string) => detail.push({ stream: 'log', text })
  const flag = (text: string, sentence: string, fix: string) => {
    detail.push({ stream: 'warn', text })
    attention.push({ sentence, fix })
  }
  const suggest = (text: string, sentence: string, fix: string) => {
    detail.push({ stream: 'warn', text })
    suggestions.push({ sentence, fix })
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
    // A project with no settings.json has NO security hooks installed — the most
    // security-relevant misconfiguration. Flag it, consistent with `doctor --hooks`
    // (which exits 1 on the same condition); reporting it as healthy would mislead.
    flag(
      `- HOOKS: (skipped) ${hooks.message}`,
      'No Claude Code settings.json — haus security hooks are not installed',
      'haus apply --write',
    )
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
    const workflowContent = (await readText(workflowPath)) ?? ''
    const firstLine = workflowContent.split('\n')[0] ?? ''
    if (!firstLine.includes('HAUS-MANAGED')) {
      ok('- .haus-workflow/WORKFLOW.md: OK (user-owned)')
    } else {
      // Compare installed template hash against current template — prefer catalog cache (same as writeWorkflow).
      const storedHashMatch = firstLine.match(/hash=(sha256-[a-f0-9]+)/)
      const bodyContent = workflowContent.slice(firstLine.length + 1)
      const cachePath = path.join(getCacheDir(), 'templates/agentic-workflow-standard.md')
      const bundledPath = path.join(
        packageRoot(),
        'library',
        'global',
        'templates',
        'agentic-workflow-standard.md',
      )
      const templatePath = (await fs.pathExists(cachePath)) ? cachePath : bundledPath
      const templateContent = await readText(templatePath)
      const verdict = checkManagedTamper(bodyContent, storedHashMatch?.[1], templateContent ?? null)

      if (verdict.status === 'tampered' || verdict.status === 'legacy-diverged') {
        flag(
          '- .haus-workflow/WORKFLOW.md: modified locally (run `haus apply --write --force` to restore)',
          'The workflow standard file was edited after haus wrote it',
          'haus apply --write --force',
        )
      } else if (verdict.status === 'stale') {
        suggest(
          '- .haus-workflow/WORKFLOW.md: stale (template updated — run `haus apply --write`)',
          'The workflow standard is out of date',
          'haus apply --write',
        )
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
      suggest(
        `- .haus-workflow/workflow-config.md: ${unfilled} field(s) still unfilled (run \`haus apply --refill-config\` to auto-fill detectable ones)`,
        `${unfilled} workflow-config field(s) are still blank`,
        'haus apply --refill-config',
      )
    } else {
      ok('- .haus-workflow/workflow-config.md: OK (project-owned)')
    }
  }

  // Guard against the formatter mutating managed files: prettier reformatting
  // .haus-workflow/WORKFLOW.md or lock-tracked .claude/ items breaks hashes and
  // makes checks above report a phantom edit. .prettierignore must cover both.
  if (workflowExists) {
    const prettierIgnore = (await readText(path.join(root, '.prettierignore'))) ?? ''
    const lines = prettierIgnore.split('\n')
    const missing = IGNORED_PATHS.filter((p) => !prettierIgnoreProtects(lines, p))
    if (missing.length > 0) {
      flag(
        `- .prettierignore: not protecting ${missing.join(', ')} (run \`haus apply --write\`)`,
        'The formatter may reformat managed files and trigger false "modified locally" reports',
        'haus apply --write',
      )
    } else {
      ok(`- .prettierignore: protects ${IGNORED_PATHS.join(' and ')}`)
    }
  }

  // Machine-local scan artifacts (context-map.json, recommendation.json,
  // sources-report.json, deep-context.json) must never be tracked in git — they carry
  // per-machine absolute paths and scan output. See ADR-0025 and `apply.ts`'s own
  // untrack-on-write migration (this is the read-only detection half of the same fix).
  const trackedArtifacts = await listTrackedArtifactPaths(root)
  if (trackedArtifacts.length > 0) {
    flag(
      `- GITIGNORE: ${trackedArtifacts.length} machine-local scan artifact(s) still tracked in git (${trackedArtifacts.join(', ')})`,
      `${trackedArtifacts.length} machine-local scan artifact(s) are still tracked in git`,
      `git rm --cached ${trackedArtifacts.join(' ')} (or run \`haus apply --write\` to do this and update .gitignore for you)`,
    )
  } else {
    ok('- GITIGNORE: OK (no machine-local scan artifacts tracked in git)')
  }

  // The inverse concern: .claude/ and .haus-workflow/ hold haus-installed, git-tracked
  // content (skills, agents, commands, WORKFLOW.md, etc.) that must NOT be gitignored.
  // A broad rule meant to cover only settings.json (e.g. a plain `.claude/` line)
  // silently hides everything installed underneath from git-tracked state.
  const gitignoredHausPaths = await findGitignoredHausPaths(root)
  if (gitignoredHausPaths.length > 0) {
    const dirs = summarizeGitignoredHausDirs(gitignoredHausPaths)
    const dirList = dirs.join(' and ')
    const verb = dirs.length === 1 ? 'is' : 'are'
    flag(
      `- GITIGNORE (haus content): ${dirList} ${verb} gitignored — installed skills/agents/commands will not be visible to anything relying on git-tracked state`,
      `${dirList} ${verb} gitignored, so haus-installed content isn't visible to git-tracked state`,
      'remove the covering .gitignore rule (only settings.json, settings.local.json, and worktrees/ under .claude/ should ever be ignored)',
    )
  } else {
    ok('- GITIGNORE (haus content): OK (.claude/ and .haus-workflow/ are tracked)')
  }

  for (const finding of await auditDecisionsLayout(root)) {
    if (finding.level === 'ok') ok(finding.line)
    else suggest(finding.line, finding.sentence, finding.fix)
  }

  const cacheAgeMs = await getCacheManifestAge()
  if (cacheAgeMs === null) {
    suggest(
      '- CATALOG CACHE: absent (run `haus update` to populate)',
      "The catalog cache hasn't been downloaded yet",
      'haus update',
    )
  } else {
    const cacheAgeDays = Math.floor(cacheAgeMs / (1000 * 60 * 60 * 24))
    if (cacheAgeDays >= 7) {
      suggest(
        `- CATALOG CACHE: stale (${cacheAgeDays}d old — run \`haus update\`)`,
        `The catalog cache is ${cacheAgeDays} days old`,
        'haus update',
      )
    } else {
      ok(`- CATALOG CACHE: OK (${cacheAgeDays}d old)`)
    }
  }

  // Only checked when a recommendation exists — an empty/missing recommendation.json
  // (fresh scan not run yet) would otherwise make every lock item look "orphaned".
  if (recommendation) {
    const lock = await readJson<Array<{ id?: string }>>(hausPath(root, 'haus.lock.json'))
    const recommendedIds = new Set(
      (recommendation.recommended as Array<{ id?: string }>)
        .map((r) => r.id)
        .filter((id): id is string => typeof id === 'string'),
    )
    const orphaned = findOrphanedLockEntries(lock ?? [], recommendedIds).map((entry) => entry.id)
    if (orphaned.length > 0) {
      suggest(
        `- CATALOG ITEMS: ${orphaned.length} installed item(s) no longer in the current recommendation (${orphaned.join(', ')})`,
        `${orphaned.length} installed item(s) are no longer recommended for this project`,
        'review whether they are still needed; haus apply --write leaves them in place until removed from the catalog',
      )
    }
  }

  const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), 'package.json'))
  const currentVersion = pkgJson?.version ?? '0.0.0'
  const npmStatus = await fetchNpmVersionStatus(currentVersion)
  if (npmStatus.updateAvailable && npmStatus.latest !== null) {
    suggest(
      `- CLI UPDATE: ${currentVersion} → ${npmStatus.latest} available (run: npm install -g ${NPM_PACKAGE_NAME})`,
      `A newer haus (${npmStatus.latest}) is available`,
      `npm install -g ${NPM_PACKAGE_NAME}`,
    )
  } else if (npmStatus.latest !== null) {
    ok(`- CLI: ${currentVersion} (up to date)`)
  } else {
    ok(`- CLI: ${currentVersion} (version check unavailable)`)
  }

  // Exit code is driven by BLOCKING problems only, so it matches the ⚠️ verdict
  // and CI can gate on `haus doctor`. Advisory suggestions never fail the exit
  // code (they are expected right after `apply`).
  if (attention.length > 0) process.exitCode = 1

  // The very first line is the plain-language verdict (the only line a non-dev
  // needs); the "Haus Doctor" title and developer detail follow beneath.
  if (attention.length === 0) {
    log('✅ Your project is set up and healthy.')
  } else {
    log(`⚠️ ${attention.length} thing(s) need attention:`)
    for (const a of attention) log(`  • ${a.sentence} — fix: ${a.fix}`)
  }
  // Suggestions are shown after the verdict whether or not the setup is healthy —
  // they're improvements, not failures (status by text + icon, never colour alone).
  if (suggestions.length > 0) {
    log(`💡 ${suggestions.length} suggestion(s):`)
    for (const s of suggestions) log(`  • ${s.sentence} — try: ${s.fix}`)
  }
  log('Haus Doctor')
  for (const line of detail) {
    if (line.stream === 'warn') warn(line.text)
    else log(line.text)
  }
}
