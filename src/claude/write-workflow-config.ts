/**
 * Writes .haus-workflow/workflow-config.md — project-owned file containing
 * project-specific workflow values (commands, doc paths, tool choices).
 * Written once on first setup; never overwritten.
 */

import path from 'node:path'

import fs from 'fs-extra'

import type { ContextMap } from '../types.js'
import { readJson, writeText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

function buildWorkflowConfig(ctx: ContextMap): string {
  const pm = ctx.packageManager === 'unknown' ? 'npm' : ctx.packageManager
  const testCmd = pm + ' test'
  const auditCmd = pm + ' audit'

  return (
    '# Project workflow configuration\n' +
    '\n' +
    '> Project-specific values for the workflow standard in WORKFLOW.md.\n' +
    '> Edit freely — this file is project-owned and will not be overwritten by haus.\n' +
    '\n' +
    '## Source-of-truth documents\n' +
    '- Spec: <!-- fill in path, e.g. docs/SPEC.md -->\n' +
    '- Design: <!-- fill in path, e.g. docs/DESIGN.md -->\n' +
    '- UX flows: <!-- fill in path, e.g. docs/UX.md -->\n' +
    '\n' +
    '## Commands\n' +
    '- Test (unit + integration): `' +
    testCmd +
    '`\n' +
    '- Test (E2E): <!-- fill in command -->\n' +
    '- Type check: <!-- fill in command, e.g. tsc --noEmit -->\n' +
    '- Lint: <!-- fill in command, e.g. npm run lint -->\n' +
    '- Lint fix: <!-- fill in command, e.g. npm run lint -- --fix -->\n' +
    '- Format check: <!-- fill in command, e.g. prettier --check . -->\n' +
    '- Security audit: `' +
    auditCmd +
    '`\n' +
    '\n' +
    '## Validation library\n' +
    '<!-- fill in, e.g. zod, yup, joi -->\n' +
    '\n' +
    '## Highest-stakes logic\n' +
    '<!-- fill in domain areas requiring TDD-only treatment, e.g. payment flows, auth, medical data -->\n' +
    '\n' +
    '## Pre-commit tool\n' +
    '<!-- fill in, e.g. lefthook, husky -->\n'
  )
}

/**
 * Write .haus-workflow/workflow-config.md at root.
 * Skips silently if the file already exists — it is project-owned from first write.
 * Returns the destination path.
 */
export async function writeWorkflowConfig(root: string, dryRun: boolean): Promise<string | null> {
  const destPath = hausPath(root, 'workflow-config.md')
  const printable = displayPath(root, destPath)

  if (await fs.pathExists(destPath)) {
    if (dryRun) log(printable + ': exists (project-owned, skipping)')
    return null
  }

  const ctx = (await readJson<ContextMap>(hausPath(root, 'context-map.json'))) ?? {
    mode: 'fast' as const,
    generatedAt: '',
    root,
    repoName: path.basename(root),
    packageManager: 'unknown' as const,
    repoRoles: [],
    confidence: 0,
    detectedStacks: {},
    dependencies: [],
    securityRisks: [],
    crossRepoHints: [],
    warnings: [],
  }

  const content = buildWorkflowConfig(ctx)

  if (dryRun) {
    log(printable + ': would create')
    return destPath
  }

  await writeText(destPath, content)
  return destPath
}
