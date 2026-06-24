/**
 * Decision gate triggers — thin loader over `library/catalog/decisions-triggers.json`.
 * Synced from haus-workflow-catalog (same pattern as validation-rules.json).
 */

import rules from '../../library/catalog/decisions-triggers.json' with { type: 'json' }

export type DecisionsTriggers = {
  decisionsDir: string
  legacyDecisionsDir?: string
  pathGlobs: string[]
  securityPathGlobs?: string[]
  pathRegex: string[]
  minFilesChanged: number
  minLinesChanged: number
  exemptGlobs: string[]
  requiredSections: string[]
  recommendedSections?: string[]
  decisionFilePattern: string
}

export const DECISIONS_TRIGGERS: DecisionsTriggers = rules as DecisionsTriggers

export const DECISION_FILE_RE = new RegExp(DECISIONS_TRIGGERS.decisionFilePattern)
