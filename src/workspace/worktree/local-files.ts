/**
 * Copy machine-local, gitignored files that `git worktree add` never checks out
 * (it only materializes tracked files) into the newly created member worktree —
 * `docker-compose.local.yml`, `.claude/settings.local.json`. Only copies a file
 * that both exists in the main checkout AND is untracked there; a tracked file
 * with the same name is already present via the worktree's own checkout and
 * copying over it would be redundant (and could stomp a legitimate per-branch
 * difference).
 */
import path from 'node:path'

import fs from 'fs-extra'

import { runGit } from '../../utils/exec.js'

export const MACHINE_LOCAL_FILES = [
  'docker-compose.local.yml',
  path.join('.claude', 'settings.local.json'),
]

async function isTracked(repoRoot: string, relFile: string): Promise<boolean> {
  const result = await runGit(['ls-files', '--error-unmatch', relFile], { cwd: repoRoot })
  return result.exitCode === 0
}

/** Copies present + untracked machine-local files from the main checkout into a worktree. Returns the relative paths copied. */
export async function copyMachineLocalFiles(
  mainMemberPath: string,
  worktreeMemberPath: string,
): Promise<string[]> {
  const copied: string[] = []
  for (const rel of MACHINE_LOCAL_FILES) {
    const src = path.join(mainMemberPath, rel)
    if (!(await fs.pathExists(src))) continue
    if (await isTracked(mainMemberPath, rel)) continue
    const dest = path.join(worktreeMemberPath, rel)
    await fs.ensureDir(path.dirname(dest))
    await fs.copy(src, dest, { overwrite: true })
    copied.push(rel)
  }
  return copied
}
