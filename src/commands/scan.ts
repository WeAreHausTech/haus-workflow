/** `haus scan` — scans the repo for roles, dependencies, and package manager; writes context-map.json. */
import { describeUnknownDetection } from '../scanner/detection.js'
import { scanProject } from '../scanner/scan-project.js'
import { hasMultipleSiblingRepos, SIBLING_REPO_WARNING } from '../scanner/sibling-repos.js'
import { resolveRoots } from '../utils/git-root.js'
import { log } from '../utils/logger.js'

/** Scans the current project and outputs detected roles and package manager; use --json for machine-readable output. */
export async function runScan(options: { json?: boolean }): Promise<void> {
  const root = process.cwd()
  const result = await scanProject(root)
  if (options.json) {
    log(JSON.stringify(result, null, 2))
    return
  }
  log('Haus scan complete')
  log(`Roles: ${result.repoRoles.join(', ') || 'unknown'}`)
  log(`Package manager: ${result.packageManager}`)
  // detectionStatus === 'unknown' is a distinct, non-swallowable warning — previously
  // this printed nothing at all, leaving a "Roles: unknown" reading unexplained. The
  // message names the linked-worktree condition explicitly when applicable, so a
  // zero-signal read from inside a `git worktree` isn't mistaken for "no stack".
  if (result.detectionStatus === 'unknown') {
    const { isLinkedWorktree } = await resolveRoots(root)
    log(`- WARN: ${describeUnknownDetection(result.unsupportedSignals, isLinkedWorktree)}`)
  }
  // Surface warnings (e.g. Node-engine mismatch, unsupported-stack hints) in human
  // mode too — previously they were written only to context-map.json on disk, so a
  // user seeing "Roles: unknown" had no explanation for it.
  for (const w of result.warnings) log(`- WARN: ${w}`)
  // D2 (Task 3.1): this root sitting on top of 2+ independent sibling repos means
  // `haus workspace discover` is the better entry point than scanning/setting up
  // each repo blind to the workspace pattern. Best-effort — never blocks the scan.
  if (await hasMultipleSiblingRepos(root)) {
    log(`- WARN: ${SIBLING_REPO_WARNING}`)
  }
}
