/**
 * Seeds `docs/decisions/README.md` when missing — decision index for agents.
 * Does not overwrite an existing index (user/team owns content after first write).
 */

import path from 'node:path'

import fs from 'fs-extra'

import { DECISIONS_TRIGGERS } from '../decisions/triggers.js'

import { writeManagedText } from './managed-write.js'

const SEED_README = `# Architecture Decision Records (ADRs)

Why we chose X — short, dated, write-once decision log for humans and agents.

| ADR | Title | Why (one line) | Status |
| --- | ----- | -------------- | ------ |
`

/** Creates docs/decisions/README.md when the directory or index is absent. */
export async function writeDecisionsSeed(root: string, dryRun: boolean): Promise<string | null> {
  const decisionsDir = path.join(root, DECISIONS_TRIGGERS.decisionsDir)
  const readmePath = path.join(decisionsDir, 'README.md')
  if (await fs.pathExists(readmePath)) return null
  if (!dryRun) await fs.ensureDir(decisionsDir)
  await writeManagedText(root, readmePath, SEED_README, dryRun)
  return readmePath
}
