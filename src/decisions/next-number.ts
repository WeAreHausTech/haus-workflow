import path from 'node:path'

import { listDecisionNumbers } from './check.js'
import { resolveDecisionsDir } from './paths.js'

/** Returns the next four-digit decision number for a repo. */
export async function nextDecisionNumber(root: string): Promise<string> {
  const decisionsDir = await resolveDecisionsDir(root)
  const numbers = await listDecisionNumbers(decisionsDir)
  const max = numbers.length === 0 ? 0 : Math.max(...numbers)
  return String(max + 1).padStart(4, '0')
}

export async function nextDecisionFilename(root: string, slug: string): Promise<string> {
  const num = await nextDecisionNumber(root)
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return path.posix.join('docs/decisions', `${num}-${safe || 'decision'}.md`)
}
