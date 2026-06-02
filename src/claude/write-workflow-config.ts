/**
 * Writes .haus-workflow/workflow-config.md — project-owned file containing
 * project-specific workflow values (commands, doc paths, tool choices).
 *
 * Written once on first setup; never overwritten. Values are inferred from the repo by
 * deriveWorkflowConfig so the file ships real commands, not placeholders. The `refill`
 * mode fills only still-blank placeholder lines of an existing file — it never touches a
 * line the user has already edited.
 */

import path from 'node:path'

import fs from 'fs-extra'

import type { ContextMap } from '../types.js'
import { readJson, writeText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

import { deriveWorkflowConfig, type WorkflowConfigValues } from './derive-workflow-config.js'

/** A managed field: its line prefix and the rendered value (derived command or doc path). */
interface Field {
  /** Stable line prefix, e.g. "- Type check: ". Used to locate the line on refill. */
  prefix: string
  /** Derived value, or null when not inferable (→ placeholder). */
  value: string | null
  /** Human hint shown inside the placeholder when value is null. */
  hint: string
  /** Whether the value renders as inline `code` (commands) vs plain text (paths/tools). */
  code?: boolean
}

function fields(v: WorkflowConfigValues): Field[] {
  return [
    { prefix: '- Spec: ', value: v.specPath, hint: 'path, e.g. docs/SPEC.md' },
    { prefix: '- Design: ', value: v.designPath, hint: 'path, e.g. docs/DESIGN.md' },
    { prefix: '- UX flows: ', value: v.uxPath, hint: 'path, e.g. docs/UX.md' },
    { prefix: '- Test (unit + integration): ', value: v.test, hint: 'command', code: true },
    { prefix: '- Test (E2E): ', value: v.testE2E, hint: 'command, e.g. playwright test', code: true },
    { prefix: '- Type check: ', value: v.typecheck, hint: 'command, e.g. tsc --noEmit', code: true },
    { prefix: '- Lint: ', value: v.lint, hint: 'command, e.g. eslint .', code: true },
    { prefix: '- Lint fix: ', value: v.lintFix, hint: 'command, e.g. eslint . --fix', code: true },
    { prefix: '- Format check: ', value: v.formatCheck, hint: 'command, e.g. prettier --check .', code: true },
    { prefix: '- Security audit: ', value: v.securityAudit, hint: 'command', code: true },
    { prefix: '- Library: ', value: v.validationLibrary, hint: 'e.g. zod, yup, joi' },
    { prefix: '- Tool: ', value: v.preCommitTool, hint: 'e.g. lefthook, husky' },
  ]
}

/** Renders the value side of a field line: inline code, plain text, or a placeholder. */
function renderValue(f: Field): string {
  if (f.value === null) return `<!-- fill in ${f.hint} -->`
  return f.code ? `\`${f.value}\`` : f.value
}

function line(f: Field): string {
  return `${f.prefix}${renderValue(f)}`
}

function buildWorkflowConfig(v: WorkflowConfigValues): string {
  const f = fields(v)
  const byPrefix = (p: string) => line(f.find((x) => x.prefix === p)!)
  return (
    '# How this project works (commands & conventions)\n' +
    '\n' +
    '> The everyday commands and conventions for this project — the build, test, and\n' +
    '> lint commands, where docs live, and so on. This file is yours to edit and haus\n' +
    '> will not overwrite it. haus fills in what it can detect on first setup;\n' +
    '> `haus apply --refill-config` fills any still-blank fields without touching\n' +
    "> anything you've edited.\n" +
    '\n' +
    '## Source-of-truth documents\n' +
    byPrefix('- Spec: ') +
    '\n' +
    byPrefix('- Design: ') +
    '\n' +
    byPrefix('- UX flows: ') +
    '\n' +
    '\n' +
    '## Commands\n' +
    byPrefix('- Test (unit + integration): ') +
    '\n' +
    byPrefix('- Test (E2E): ') +
    '\n' +
    byPrefix('- Type check: ') +
    '\n' +
    byPrefix('- Lint: ') +
    '\n' +
    byPrefix('- Lint fix: ') +
    '\n' +
    byPrefix('- Format check: ') +
    '\n' +
    byPrefix('- Security audit: ') +
    '\n' +
    '\n' +
    '## Validation library\n' +
    byPrefix('- Library: ') +
    '\n' +
    '\n' +
    '## Highest-stakes logic\n' +
    '<!-- fill in domain areas requiring TDD-only treatment, e.g. payment flows, auth, medical data -->\n' +
    '\n' +
    '## Pre-commit tool\n' +
    byPrefix('- Tool: ') +
    '\n'
  )
}

/**
 * Fills only still-blank placeholder lines of an existing config with newly derived
 * values. A line whose value the user has already filled (not a `<!--` placeholder) is
 * left untouched; a field that is still not inferable stays a placeholder.
 */
function refillContent(existing: string, v: WorkflowConfigValues): string {
  const f = fields(v)
  return existing
    .split('\n')
    .map((ln) => {
      const field = f.find((x) => ln.startsWith(x.prefix))
      if (!field || field.value === null) return ln
      const rest = ln.slice(field.prefix.length).trim()
      // Only replace a line still holding the haus placeholder; preserve user edits
      // (including a deliberate value that happens to start with an HTML comment).
      return rest.startsWith('<!-- fill in') ? line(field) : ln
    })
    .join('\n')
}

const FALLBACK_CONTEXT: ContextMap = {
  mode: 'fast',
  generatedAt: '',
  root: '',
  repoName: '',
  packageManager: 'unknown',
  repoRoles: [],
  confidence: 0,
  detectedStacks: {},
  dependencies: [],
  securityRisks: [],
  crossRepoHints: [],
  warnings: [],
  detectionStatus: 'unknown',
  unsupportedSignals: [],
}

/**
 * Write .haus-workflow/workflow-config.md at root.
 * - First write: derives values and creates the file.
 * - `refill`: fills still-blank placeholder lines of an existing file (never user edits).
 * - Otherwise skips an existing file — it is project-owned from first write.
 *
 * @returns The destination path when written, else null.
 */
export async function writeWorkflowConfig(
  root: string,
  dryRun: boolean,
  opts: { refill?: boolean } = {},
): Promise<string | null> {
  const destPath = hausPath(root, 'workflow-config.md')
  const printable = displayPath(root, destPath)
  const exists = await fs.pathExists(destPath)

  // Skip the (disk-touching) derivation entirely on the common path: file already
  // present and not refilling. Project-owned from first write.
  if (exists && !opts.refill) {
    if (dryRun) log(printable + ': exists (project-owned, skipping)')
    return null
  }

  const ctx = (await readJson<ContextMap>(hausPath(root, 'context-map.json'))) ?? {
    ...FALLBACK_CONTEXT,
    root,
    repoName: path.basename(root),
  }
  const values = await deriveWorkflowConfig(root, ctx)

  if (exists) {
    const current = await fs.readFile(destPath, 'utf8')
    const refilled = refillContent(current, values)
    if (refilled === current) {
      if (dryRun) log(printable + ': no blank fields to refill')
      return null
    }
    if (dryRun) {
      log(printable + ': would refill blank fields')
      return destPath
    }
    await writeText(destPath, refilled)
    return destPath
  }

  if (dryRun) {
    log(printable + ': would create')
    return destPath
  }
  await writeText(destPath, buildWorkflowConfig(values))
  return destPath
}
