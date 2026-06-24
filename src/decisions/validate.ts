import path from 'node:path'

import fs from 'fs-extra'

import { readText } from '../utils/fs.js'

import { DECISION_FILE_RE, DECISIONS_TRIGGERS } from './triggers.js'

export type ValidateDecisionResult = { ok: true } | { ok: false; errors: string[] }

/** Validates decision markdown structure (required sections). */
export function validateDecisionContent(content: string): ValidateDecisionResult {
  const errors: string[] = []
  for (const section of DECISIONS_TRIGGERS.requiredSections) {
    if (!content.includes(section)) {
      errors.push(`missing required section: ${section}`)
    }
  }
  if (!/^#\s+ADR-\d{4}:/m.test(content)) {
    errors.push('heading must match "# ADR-NNNN: Title"')
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

/** True when README index references the decision number. */
export function indexReferencesNumber(readme: string, number: string): boolean {
  const padded = number.padStart(4, '0')
  return (
    readme.includes(`[${padded}]`) ||
    readme.includes(`(${padded}-`) ||
    readme.includes(`ADR-${padded}`)
  )
}

export async function validateDecisionFile(filePath: string): Promise<ValidateDecisionResult> {
  const content = (await readText(filePath)) ?? ''
  return validateDecisionContent(content)
}

export function isDecisionFileName(name: string): boolean {
  return DECISION_FILE_RE.test(name)
}

export function decisionNumberFromFile(name: string): string | null {
  const match = /^(\d{4})-/.exec(name)
  return match?.[1] ?? null
}

export async function validateIndexSync(
  decisionsDir: string,
  decisionFiles: string[],
): Promise<string[]> {
  const readmePath = path.join(decisionsDir, 'README.md')
  if (!(await fs.pathExists(readmePath))) {
    return ['docs/decisions/README.md is missing']
  }
  const readme = (await readText(readmePath)) ?? ''
  const errors: string[] = []
  for (const file of decisionFiles) {
    const num = decisionNumberFromFile(path.basename(file))
    if (num && !indexReferencesNumber(readme, num)) {
      errors.push(`README.md missing index row for ADR-${num}`)
    }
  }
  return errors
}
