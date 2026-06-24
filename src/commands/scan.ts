/** `haus scan` — scans the repo for roles, dependencies, and package manager; writes context-map.json. */
import { scanProject } from '../scanner/scan-project.js'
import { log } from '../utils/logger.js'

/** Scans the current project and outputs detected roles and package manager; use --json for machine-readable output. */
export async function runScan(options: { json?: boolean }): Promise<void> {
  const result = await scanProject(process.cwd())
  if (options.json) {
    log(JSON.stringify(result, null, 2))
    return
  }
  log('Haus scan complete')
  log(`Roles: ${result.repoRoles.join(', ') || 'unknown'}`)
  log(`Package manager: ${result.packageManager}`)
  // Surface warnings (e.g. Node-engine mismatch, unsupported-stack hints) in human
  // mode too — previously they were written only to context-map.json on disk, so a
  // user seeing "Roles: unknown" had no explanation for it.
  for (const w of result.warnings) log(`- WARN: ${w}`)
}
