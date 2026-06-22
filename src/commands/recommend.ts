/** `haus recommend` — scores catalog items against the scanned context and writes recommendation.json. */
import { recommend } from '../recommender/recommend.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

/** Normalize a commander variadic/CSV option into a flat, trimmed id list. */
function parseIdList(value: string[] | string | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Scores catalog items against the scanned context and persists recommendation.json. */
export async function runRecommend(options: {
  json?: boolean
  include?: string[] | string
}): Promise<void> {
  const root = process.cwd()
  const context = await readContextOrScan(root)
  const include = parseIdList(options.include)
  const result = await recommend(root, context, { include })
  await writeJson(hausPath(root, 'recommendation.json'), result)
  if (options.json) {
    log(JSON.stringify(result, null, 2))
    return
  }
  log('Haus recommendation ready')
  log(`Recommended: ${result.recommended.length}`)
  log(`Skipped: ${result.skipped.length}`)
  if (result.optInEligible && result.optInEligible.length > 0) {
    log(
      `Opt-in available: ${result.optInEligible.length} (add with \`haus recommend --include <id>\`)`,
    )
  }
  for (const w of result.warnings.filter((w) => w.startsWith('--include:'))) log(w)
}
