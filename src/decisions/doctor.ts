import path from 'node:path'

import fs from 'fs-extra'

import { readText } from '../utils/fs.js'

import { listDecisionNumbers } from './check.js'
import { relativeDecisionPath, resolveDecisionsDir } from './paths.js'
import { DECISIONS_TRIGGERS } from './triggers.js'
import { decisionNumberFromFile } from './validate.js'

export type DecisionsDoctorFinding = {
  level: 'advisory' | 'ok'
  line: string
  sentence: string
  fix: string
}

/** Advisory checks for docs/decisions index drift and legacy docs/adr migration. */
export async function auditDecisionsLayout(root: string): Promise<DecisionsDoctorFinding[]> {
  const findings: DecisionsDoctorFinding[] = []
  const primary = path.join(root, DECISIONS_TRIGGERS.decisionsDir)
  const legacy = path.join(root, DECISIONS_TRIGGERS.legacyDecisionsDir ?? 'docs/adr')
  const hasPrimary = await fs.pathExists(primary)
  const hasLegacy = await fs.pathExists(legacy)

  if (!hasPrimary && hasLegacy) {
    findings.push({
      level: 'advisory',
      line: `- DECISIONS: legacy ${DECISIONS_TRIGGERS.legacyDecisionsDir}/ present — migrate to docs/decisions/`,
      sentence: 'Decision records still live under the legacy docs/adr/ path',
      fix: `git mv ${DECISIONS_TRIGGERS.legacyDecisionsDir} ${DECISIONS_TRIGGERS.decisionsDir}`,
    })
    return findings
  }

  if (!hasPrimary) return findings

  const decisionsDir = await resolveDecisionsDir(root)
  const rel = relativeDecisionPath(decisionsDir, root)
  const readmePath = path.join(decisionsDir, 'README.md')
  if (!(await fs.pathExists(readmePath))) {
    findings.push({
      level: 'advisory',
      line: `- DECISIONS: missing ${rel}/README.md index`,
      sentence: 'No decision index for agents to load at session start',
      fix: `create ${rel}/README.md and @import it from CLAUDE.md`,
    })
    return findings
  }

  const readme = await readText(readmePath)
  const entries = (await fs.readdir(decisionsDir)).filter(
    (f) => f.endsWith('.md') && f !== 'README.md',
  )
  for (const file of entries) {
    const num = decisionNumberFromFile(file)
    if (num && readme && !readme.includes(`[${num}]`) && !readme.includes(`(${num}-`)) {
      findings.push({
        level: 'advisory',
        line: `- DECISIONS: ${file} missing from ${rel}/README.md`,
        sentence: `ADR-${num} is not listed in the decision index`,
        fix: `add a row for ADR-${num} to ${rel}/README.md`,
      })
    }
  }

  const claude = await readText(path.join(root, 'CLAUDE.md'))
  if (claude && !claude.includes(`@${rel}/README.md`)) {
    findings.push({
      level: 'advisory',
      line: `- DECISIONS: CLAUDE.md does not @import @${rel}/README.md`,
      sentence: 'Agents may not load the decision index at session start',
      fix: `add @${rel}/README.md to CLAUDE.md`,
    })
  }

  const numbers = await listDecisionNumbers(decisionsDir)
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i)
  if (dupes.length > 0) {
    findings.push({
      level: 'advisory',
      line: `- DECISIONS: duplicate numbers: ${[...new Set(dupes)].join(', ')}`,
      sentence: 'Multiple decision files share the same number',
      fix: 'renumber one file and update README.md',
    })
  }

  if (findings.length === 0) {
    findings.push({
      level: 'ok',
      line: `- DECISIONS OK: ${rel}/ (${entries.length} record(s))`,
      sentence: '',
      fix: '',
    })
  }
  return findings
}
