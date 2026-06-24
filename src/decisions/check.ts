import path from 'node:path'

import fs from 'fs-extra'

import { readJson, readText } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import type { DiffStats } from './diff.js'
import { collectDiffStats } from './diff.js'
import { matchesAnyGlob, matchesAnyRegex } from './match.js'
import { relativeDecisionPath, resolveDecisionsDir } from './paths.js'
import { DECISIONS_TRIGGERS } from './triggers.js'
import {
  decisionNumberFromFile,
  isDecisionFileName,
  validateDecisionContent,
  validateIndexSync,
} from './validate.js'

export type GateMode = 'on' | 'off'

export type CheckResult = {
  triggered: boolean
  satisfied: boolean
  reasons: string[]
  securityTriggered: boolean
}

function isExempt(file: string): boolean {
  return matchesAnyGlob(file, DECISIONS_TRIGGERS.exemptGlobs)
}

function countTopLevelDirs(files: string[]): number {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = f.split('/')
    if (parts.length > 1) dirs.add(parts[0]!)
  }
  return dirs.size
}

/** Returns true when the diff touches decision-worthy paths. */
export function isDecisionTriggered(stats: DiffStats): boolean {
  const relevant = stats.files.filter((f) => !isExempt(f))
  if (relevant.length === 0) return false

  for (const file of relevant) {
    if (matchesAnyGlob(file, DECISIONS_TRIGGERS.pathGlobs)) return true
    if (matchesAnyRegex(file, DECISIONS_TRIGGERS.pathRegex)) return true
  }

  const totalLines = stats.linesAdded + stats.linesRemoved
  if (relevant.length >= DECISIONS_TRIGGERS.minFilesChanged && countTopLevelDirs(relevant) >= 2) {
    return true
  }
  if (
    totalLines >= DECISIONS_TRIGGERS.minLinesChanged &&
    relevant.some((f) => !f.startsWith('docs/'))
  ) {
    return true
  }
  return false
}

export function isSecurityTriggered(stats: DiffStats): boolean {
  const relevant = stats.files.filter((f) => !isExempt(f))
  const security = DECISIONS_TRIGGERS.securityPathGlobs ?? []
  return relevant.some(
    (f) => matchesAnyGlob(f, security) || matchesAnyRegex(f, DECISIONS_TRIGGERS.pathRegex),
  )
}

async function readGateMode(root: string): Promise<GateMode> {
  const cfg = await readJson<{ mode?: GateMode }>(hausPath(root, 'adr-gate.json'))
  return cfg?.mode === 'off' ? 'off' : 'on'
}

export function hasSkipToken(text: string): boolean {
  return text.includes('[adr-skip]')
}

type SatisfactionInput = {
  root: string
  decisionsRel: string
  changedFiles: string[]
}

async function checkSatisfaction(input: SatisfactionInput): Promise<string[]> {
  const errors: string[] = []
  const decisionsPrefix = `${input.decisionsRel}/`
  const newDecisionFiles = input.changedFiles.filter(
    (f) => f.startsWith(decisionsPrefix) && isDecisionFileName(path.basename(f)),
  )
  if (newDecisionFiles.length === 0) {
    errors.push(`no new or updated decision under ${input.decisionsRel}/`)
    return errors
  }

  const decisionsDir = path.join(input.root, input.decisionsRel)
  for (const rel of newDecisionFiles) {
    const abs = path.join(input.root, rel)
    const content = (await readText(abs)) ?? ''
    const valid = validateDecisionContent(content)
    if (!valid.ok) errors.push(...valid.errors.map((e) => `${rel}: ${e}`))
  }

  const indexErrors = await validateIndexSync(
    decisionsDir,
    newDecisionFiles.map((f) => path.basename(f)),
  )
  errors.push(...indexErrors)
  return errors
}

export async function runDecisionsCheck(
  root: string,
  opts: {
    staged?: boolean
    range?: string
    prBody?: string
    commitMessages?: string
  } = {},
): Promise<CheckResult> {
  const reasons: string[] = []
  if ((await readGateMode(root)) === 'off') {
    return {
      triggered: false,
      satisfied: true,
      reasons: ['gate disabled via .haus-workflow/adr-gate.json'],
      securityTriggered: false,
    }
  }

  const stats = await collectDiffStats(root, opts)
  const triggered = isDecisionTriggered(stats)
  const securityTriggered = isSecurityTriggered(stats)

  if (!triggered) {
    return {
      triggered: false,
      satisfied: true,
      reasons: ['no decision-worthy changes'],
      securityTriggered,
    }
  }

  const skipText = `${opts.prBody ?? ''}\n${opts.commitMessages ?? ''}`
  if (hasSkipToken(skipText) && !securityTriggered) {
    reasons.push('[adr-skip] present — gate waived (non-security change)')
    return { triggered: true, satisfied: true, reasons, securityTriggered }
  }
  if (hasSkipToken(skipText) && securityTriggered) {
    reasons.push('[adr-skip] ignored for security/auth path changes')
  }

  const decisionsDir = await resolveDecisionsDir(root)
  const decisionsRel = relativeDecisionPath(decisionsDir, root)
  const legacyRel = DECISIONS_TRIGGERS.legacyDecisionsDir ?? 'docs/adr'

  let satisfactionErrors = await checkSatisfaction({
    root,
    decisionsRel,
    changedFiles: stats.files,
  })

  if (satisfactionErrors.length > 0 && decisionsRel !== legacyRel) {
    const legacyExists = await fs.pathExists(path.join(root, legacyRel))
    if (legacyExists && !(await fs.pathExists(decisionsDir))) {
      satisfactionErrors = await checkSatisfaction({
        root,
        decisionsRel: legacyRel,
        changedFiles: stats.files,
      })
    }
  }

  if (satisfactionErrors.length === 0) {
    return {
      triggered: true,
      satisfied: true,
      reasons: ['decision record present'],
      securityTriggered,
    }
  }

  reasons.push(...satisfactionErrors)
  return { triggered: true, satisfied: false, reasons, securityTriggered }
}

export async function listDecisionNumbers(decisionsDir: string): Promise<number[]> {
  if (!(await fs.pathExists(decisionsDir))) return []
  const entries = await fs.readdir(decisionsDir)
  return entries
    .map((name) => decisionNumberFromFile(name))
    .filter((n): n is string => n != null)
    .map((n) => Number(n))
}
