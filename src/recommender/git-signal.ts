/** Git change signal for the recommender: surfaces unstaged files to mark active work areas. */

import { runGit } from '../utils/exec.js'

/** Read unstaged changed files from git so rules touching active work areas become eligible. */
export async function readChangedFiles(root: string): Promise<string[]> {
  if (process.env.HAUS_DISABLE_GIT_SIGNALS === '1') return []
  try {
    const result = await runGit(['diff', '--name-only'], { cwd: root, timeout: 3000 })
    if (result.exitCode !== 0) {
      return []
    }
    return result.stdout
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
  } catch {
    return []
  }
}
