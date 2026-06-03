/** Rendering + content-index helpers for the scanner. */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { ContextMap } from '../types.js'

import { describeRepo } from './role-labels.js'

/**
 * Builds a single content blob from the first 300 candidate files (code/config
 * extensions), read ONCE. The registry's `content` signals search this blob instead of
 * re-reading every file per needle. The 300-file cap keeps scan time predictable on
 * large monorepos; files are joined with newlines so no needle matches across a boundary.
 *
 * @param root - Absolute project root.
 * @param files - Full safe file list; filtered internally to code/config extensions.
 */
export async function buildContentBlob(root: string, files: string[]): Promise<string> {
  const candidates = files.filter(
    (f) =>
      f.endsWith('.ts') ||
      f.endsWith('.js') ||
      f.endsWith('.php') ||
      f.endsWith('.json') ||
      f.endsWith('.yml') ||
      f.endsWith('.yaml'),
  )
  // Read in bounded chunks rather than one big Promise.all — 300 concurrent opens can
  // exhaust file descriptors (EMFILE) on some systems; chunking keeps the one-pass win.
  const slice = candidates.slice(0, 300)
  const CHUNK = 24
  const parts: string[] = []
  for (let i = 0; i < slice.length; i += CHUNK) {
    const batch = await Promise.all(
      slice.slice(i, i + CHUNK).map(async (rel) => {
        try {
          return await readFile(path.join(root, rel), 'utf8')
        } catch {
          // File may have been deleted or be unreadable — skip and continue.
          return ''
        }
      }),
    )
    parts.push(...batch)
  }
  return parts.join('\n')
}

/**
 * Computes a 0–0.99 confidence score based on how many roles and stack entries
 * were detected.  More signals → higher confidence.
 * Formula: 0.4 base + 0.08 per role + 0.02 per stack entry, capped at 0.99.
 * Returns 0.15 when no roles were found (minimal signal).
 */
export function computeConfidence(roles: string[], stacks: Record<string, string[]>): number {
  const stackCount = Object.values(stacks).reduce((sum, arr) => sum + arr.length, 0)
  if (roles.length === 0) return 0.15
  return Math.min(0.99, Number((0.4 + roles.length * 0.08 + stackCount * 0.02).toFixed(2)))
}

/** Renders a concise markdown summary of the context map for repo-summary.md. */
export function renderSummary(context: ContextMap): string {
  return `# Repo summary

${describeRepo(context)}

- Repo: ${context.repoName}
- Package manager: ${context.packageManager}
- Roles: ${context.repoRoles.join(', ') || 'unknown'}
- Generated: ${context.generatedAt}
`
}
