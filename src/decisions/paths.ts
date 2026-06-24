import path from 'node:path'

import fs from 'fs-extra'

import { DECISIONS_TRIGGERS } from './triggers.js'

/** Active decisions directory: prefers `docs/decisions/`, falls back to legacy `docs/adr/`. */
export async function resolveDecisionsDir(root: string): Promise<string> {
  const primary = path.join(root, DECISIONS_TRIGGERS.decisionsDir)
  if (await fs.pathExists(primary)) return primary
  const legacy = path.join(root, DECISIONS_TRIGGERS.legacyDecisionsDir ?? 'docs/adr')
  if (await fs.pathExists(legacy)) return legacy
  return primary
}

export function relativeDecisionPath(decisionsDir: string, root: string): string {
  return path.relative(root, decisionsDir).replace(/\\/g, '/')
}
