/** `haus recommend` — scores catalog items against the scanned context and writes recommendation.json. */
import { recommend } from '../recommender/recommend.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

/** Scores catalog items against the scanned context and persists recommendation.json. */
export async function runRecommend(options: { json?: boolean }): Promise<void> {
  const root = process.cwd()
  const context = await readContextOrScan(root)
  const result = await recommend(root, context)
  await writeJson(hausPath(root, 'recommendation.json'), result)
  if (options.json) {
    log(JSON.stringify(result, null, 2))
    return
  }
  log('Haus recommendation ready')
  log(`Recommended: ${result.recommended.length}`)
  log(`Skipped: ${result.skipped.length}`)
}
