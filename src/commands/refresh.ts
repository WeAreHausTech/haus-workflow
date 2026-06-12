/** `haus refresh` — re-scans the project, refreshes recommendations, and updates scan artifacts. */
import { recommend } from '../recommender/recommend.js'
import { scanProject } from '../scanner/scan-project.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

/** Re-scans in fast mode, writes context + sources-report, and regenerates recommendation.json. */
export async function runRefresh(): Promise<void> {
  const root = process.cwd()
  const context = await scanProject(root)
  const recommendation = await recommend(root, context)
  await writeJson(hausPath(root, 'recommendation.json'), recommendation)

  log('Haus refresh complete')
  log(`Roles: ${context.repoRoles.join(', ') || 'unknown'}`)
  log(`Package manager: ${context.packageManager}`)
  log(`Recommended items: ${recommendation.recommended.length}`)
}
