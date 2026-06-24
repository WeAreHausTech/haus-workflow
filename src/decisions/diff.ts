import { runGit } from '../utils/exec.js'

export type DiffStats = {
  files: string[]
  linesAdded: number
  linesRemoved: number
}

/** Lists changed file paths and line counts for a git revision range or staged index. */
export async function collectDiffStats(
  root: string,
  opts: { staged?: boolean; range?: string },
): Promise<DiffStats> {
  const gitArgs = opts.staged
    ? ['diff', '--cached', '--name-only']
    : ['diff', '--name-only', opts.range ?? 'HEAD']
  const names = await runGit(gitArgs, { cwd: root })
  const files = names.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  const numstatArgs = opts.staged
    ? ['diff', '--cached', '--numstat']
    : ['diff', '--numstat', opts.range ?? 'HEAD']
  const numstat = await runGit(numstatArgs, { cwd: root })
  let linesAdded = 0
  let linesRemoved = 0
  for (const line of numstat.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const added = parts[0] === '-' ? 0 : Number(parts[0])
    const removed = parts[1] === '-' ? 0 : Number(parts[1])
    if (!Number.isNaN(added)) linesAdded += added
    if (!Number.isNaN(removed)) linesRemoved += removed
  }
  return { files, linesAdded, linesRemoved }
}
