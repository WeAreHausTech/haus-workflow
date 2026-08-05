/**
 * Manages a haus-managed block in the project's `.gitignore` that keeps machine-local
 * scan artifacts out of version control.
 *
 * Why this exists: `context-map.json`, `recommendation.json`, and `sources-report.json`
 * are written by `haus scan`/`haus apply` on every run and carry machine-local absolute
 * paths and per-developer scan output. `deep-context.json` is authored at runtime by the
 * writing-documentation skill (catalog-side, not this CLI), but it lives under the same
 * `.haus-workflow/` directory and the same "never commit machine-local output" rule
 * applies regardless of who writes it. None of these should ever have been tracked in a
 * consumer repo — see ADR-0025.
 *
 * `haus.lock.json` is deliberately NOT in this list: it's a registry of catalog content
 * haus installed into the repo's own tracked content, so it correctly stays tracked.
 * `setup-answers.json` is deliberately NOT in this list either: there is no writer for it
 * anywhere in this CLI's current `src/`/`library/` — see ADR-0025 for why it's excluded
 * rather than guessed at.
 *
 * Sentinel choice: this mirrors the sentinel-block convention `write-prettierignore.ts`
 * already uses (`# HAUS:BEGIN` / `# HAUS:END`, ADR-0006 style) rather than the markdown
 * `<!-- HAUS-MANAGED ... -->` header `write-workflow.ts` uses for content-hash tamper
 * detection — `.gitignore` syntax has no comment-block convention of its own to extend,
 * and a bare `#`-comment sentinel pair is the natural fit for a line-oriented ignore
 * file, exactly the same reasoning `write-prettierignore.ts` already documents for its
 * own (non-markdown) sentinel choice.
 */

import path from 'node:path'

import fs from 'fs-extra'

import { runGit } from '../utils/exec.js'

import { writeManagedText } from './managed-write.js'

/** Opening sentinel for the managed block (a comment line in .gitignore syntax). */
export const GITIGNORE_BEGIN = '# HAUS:BEGIN haus-managed v=1'
/** Closing sentinel for the managed block. */
export const GITIGNORE_END = '# HAUS:END haus-managed'

/**
 * Repo-relative paths of machine-local scan artifacts haus writes that must never be
 * tracked in git. Adjust alongside `hausPath()` usage if any of these ever move.
 */
export const GITIGNORED_ARTIFACT_PATHS = [
  '.haus-workflow/context-map.json',
  '.haus-workflow/recommendation.json',
  '.haus-workflow/sources-report.json',
  '.haus-workflow/deep-context.json',
] as const

/** Locate `marker` as a full line in `content`; returns its char range or null. */
function findLineMarker(
  content: string,
  marker: string,
  from = 0,
): { start: number; end: number } | null {
  let idx = content.indexOf(marker, from)
  while (idx !== -1) {
    const lineStart = idx === 0 || content[idx - 1] === '\n'
    const after = idx + marker.length
    const lineEnd = after === content.length || content[after] === '\n' || content[after] === '\r'
    if (lineStart && lineEnd) return { start: idx, end: after }
    idx = content.indexOf(marker, idx + marker.length)
  }
  return null
}

/** Char range of the full managed block (BEGIN..END), or null if absent/unterminated. */
function findBlockRange(content: string): { start: number; end: number } | null {
  const begin = findLineMarker(content, GITIGNORE_BEGIN)
  if (!begin) return null
  const end = findLineMarker(content, GITIGNORE_END, begin.end)
  if (!end) return null
  return { start: begin.start, end: end.end }
}

/**
 * True when a plain (non-managed-block) `.gitignore` line already covers `entry`,
 * either by an exact match (accounting for common leading-slash equivalents) or
 * because a broader directory pattern already ignores everything under it (e.g. a
 * plain `.haus-workflow/` entry covers `.haus-workflow/context-map.json`).
 *
 * Intentionally simple exact-line / directory-prefix detection — not a full
 * gitignore pattern-matching engine (no glob evaluation beyond a trailing `/**`,
 * no negation handling, no nested-.gitignore awareness). Good enough to avoid the
 * common real-world duplicate case without over-building.
 */
export function gitignoreCovers(lines: readonly string[], entry: string): boolean {
  const bare = entry.replace(/^\/+/, '')
  const exactEquivalents = new Set([bare, `/${bare}`])
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (exactEquivalents.has(line)) return true

    // Directory-prefix pattern, e.g. `.haus-workflow/`, `/.haus-workflow`, or
    // `.haus-workflow/**`, covering every file beneath it — but only when the
    // pattern is a plain path with no other glob metacharacters, keeping this
    // "trivially detectable" rather than a real matcher.
    const dirCandidate = line
      .replace(/^\/+/, '')
      .replace(/\/\*\*$/, '')
      .replace(/\/$/, '')
    if (dirCandidate && !/[*?[\]!]/.test(dirCandidate)) {
      if (bare === dirCandidate || bare.startsWith(`${dirCandidate}/`)) return true
    }
  }
  return false
}

/** Lines of `content` with the managed block's own lines excluded (if present). */
function linesOutsideBlock(content: string): string[] {
  const range = findBlockRange(content)
  const outside = range ? content.slice(0, range.start) + content.slice(range.end) : content
  return outside.split('\n')
}

/**
 * Build the managed block for the artifact paths not already covered by the user's
 * existing (non-managed) `.gitignore` lines. Returns null when every artifact path
 * is already covered — nothing to add.
 */
function buildBlockForUncovered(existing: string): string | null {
  const outside = linesOutsideBlock(existing)
  const needed = GITIGNORED_ARTIFACT_PATHS.filter((p) => !gitignoreCovers(outside, p))
  if (needed.length === 0) return null
  return [
    GITIGNORE_BEGIN,
    '# haus scan artifacts — machine-local, must never be committed (see ADR-0025)',
    ...needed,
    GITIGNORE_END,
  ].join('\n')
}

/** Build the full managed block listing every covered artifact path, regardless of
 * what else is in the file. Exposed for tests that want the canonical full block. */
export function buildGitignoreBlock(): string {
  return [
    GITIGNORE_BEGIN,
    '# haus scan artifacts — machine-local, must never be committed (see ADR-0025)',
    ...GITIGNORED_ARTIFACT_PATHS,
    GITIGNORE_END,
  ].join('\n')
}

/**
 * Replace the existing managed block in `existing` with a freshly computed one (only
 * listing artifact paths not already covered by the user's own entries), or append it
 * when none is present. When nothing needs to be added, an existing managed block is
 * stripped (nothing left for it to responsibly own); a file with no managed block and
 * nothing to add is returned unchanged. User content outside the sentinels is always
 * preserved. The result ends with a single trailing newline whenever a block exists.
 */
export function injectGitignoreBlock(existing: string): string {
  const block = buildBlockForUncovered(existing)
  const range = findBlockRange(existing)

  if (block === null) {
    // Nothing needs haus's block anymore (every artifact already covered by the
    // user's own entries) — strip a stale managed block if one exists; otherwise
    // leave the file untouched.
    if (!range) return existing
    const before = existing.slice(0, range.start)
    const after = existing.slice(range.end)
    const merged = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trimEnd()
    return merged.length > 0 ? `${merged}\n` : ''
  }

  if (range) {
    const before = existing.slice(0, range.start)
    const after = existing.slice(range.end)
    return `${before}${block}${after}`.replace(/\n*$/, '\n')
  }

  // Malformed prior file (BEGIN present but END missing): replace trailing broken block.
  const loneBegin = findLineMarker(existing, GITIGNORE_BEGIN)
  if (loneBegin) {
    const before = existing.slice(0, loneBegin.start).trimEnd()
    if (before.length === 0) return `${block}\n`
    return `${before}\n\n${block}\n`
  }

  const trimmed = existing.trimEnd()
  if (trimmed.length === 0) return `${block}\n`
  return `${trimmed}\n\n${block}\n`
}

/** Remove the managed block from `existing`, preserving surrounding user content. */
export function stripGitignoreBlock(existing: string): string {
  const range = findBlockRange(existing)
  if (!range) return existing
  const before = existing.slice(0, range.start)
  const after = existing.slice(range.end)
  const merged = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trimEnd()
  return merged.length > 0 ? `${merged}\n` : ''
}

/**
 * Write `.gitignore` at `root`, injecting (or refreshing) the haus managed block so
 * machine-local scan artifacts are never tracked going forward. Additive and
 * idempotent: never clobbers existing user entries, never duplicates an entry the
 * user already has (verbatim or via an already-covering directory pattern).
 * Returns the absolute path of the file.
 */
export async function writeGitignore(root: string, dryRun: boolean): Promise<string> {
  const filePath = path.join(root, '.gitignore')
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : ''
  const next = injectGitignoreBlock(prev)
  await writeManagedText(root, filePath, next, dryRun)
  return filePath
}

/**
 * Repo-relative paths (among `GITIGNORED_ARTIFACT_PATHS`) currently tracked in git at
 * `root`. Returns an empty array — never throws — when `root` isn't a git repository,
 * git is unavailable, or the check times out; callers treat that the same as "nothing
 * tracked" rather than surfacing a spurious failure for an orthogonal git problem.
 */
export async function listTrackedArtifactPaths(root: string): Promise<string[]> {
  try {
    const result = await runGit(['ls-files', '--', ...GITIGNORED_ARTIFACT_PATHS], {
      cwd: root,
      timeout: 5000,
    })
    if (result.exitCode !== 0) return []
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Runs `git rm --cached` on every currently-tracked artifact path at `root`, printing
 * a clear, non-silent explanation per file (never silent — an untrack is a real,
 * user-visible change to what git will commit next). In `dryRun`, only previews what
 * would be untracked; nothing is changed. Idempotent: when nothing is tracked (e.g. a
 * second run after the first already untracked everything), this is a silent no-op.
 */
export async function untrackMachineLocalArtifacts(
  root: string,
  dryRun: boolean,
  notify: (message: string) => void,
): Promise<string[]> {
  const tracked = await listTrackedArtifactPaths(root)
  const untracked: string[] = []
  for (const rel of tracked) {
    if (dryRun) {
      notify(
        `Would untrack ${rel} from git — it contains machine-local scan output and should never have been committed.`,
      )
      continue
    }
    const result = await runGit(['rm', '--cached', '--quiet', '--', rel], { cwd: root })
    if (result.exitCode === 0) {
      untracked.push(rel)
      notify(
        `Untracked ${rel} from git — it contains machine-local scan output and should never have been committed. Run \`git status\` to review before committing this change.`,
      )
    } else {
      notify(`Could not untrack ${rel} from git: ${result.stderr.trim() || result.stdout.trim()}`)
    }
  }
  return untracked
}
