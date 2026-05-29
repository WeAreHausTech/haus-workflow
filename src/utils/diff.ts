/** Text-diff helpers used when writing managed files — detect changes and summarize them. */

import { createTwoFilesPatch } from 'diff'

export function hasTextChanged(before: string, after: string): boolean {
  return before !== after
}

/** Produce a unified diff for `filePath` with 3 lines of context. */
export function createUnifiedDiff(filePath: string, before: string, after: string): string {
  return createTwoFilesPatch(filePath, filePath, before, after, 'before', 'after', {
    context: 3,
  })
}

/** Count added and removed lines in a unified diff string. */
export function summarizeDiff(diffText: string): { additions: number; deletions: number } {
  const lines = diffText.split('\n')
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    // Skip the file-header lines (+++ / ---) so they don't inflate the counts
    if (line.startsWith('+++ ') || line.startsWith('--- ')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}
