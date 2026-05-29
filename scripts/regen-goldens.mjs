// One-off: regenerate golden scan + recommendation snapshots after detection changes.
// Run via: node scripts/regen-goldens.mjs
// Safe because tests compare deepEqual against these files. Always git-diff before committing.

import fs from 'node:fs'
import path from 'node:path'
import {
  cloneFixtureToTemp,
  normalizeContextForGolden,
  normalizeRecommendationForGolden,
  readHausJson,
  runHaus,
} from '../tests/helpers/fixture-runner.js'

const scanFixtures = [
  'vendure-monorepo',
  'nextjs-app',
  'nest-graphql-api',
  'laravel-app',
  'wordpress-bedrock-site',
  'turbo-monorepo',
  'nx-workspace',
]

const contextFixtures = ['nx-workspace', 'nextjs-app', 'turbo-monorepo', 'vendure-monorepo']

for (const fixture of scanFixtures) {
  const cwd = cloneFixtureToTemp(fixture)
  runHaus(cwd, 'scan --json')
  const context = readHausJson(cwd, 'context-map.json')
  const normalized = normalizeContextForGolden(context)
  const out = path.resolve('tests/golden/scans', `${fixture}.json`)
  fs.writeFileSync(out, JSON.stringify(normalized, null, 2) + '\n')
  console.log(`updated scan golden: ${fixture}`)
}

for (const fixture of contextFixtures) {
  const goldenPath = path.resolve('tests/golden/context', `${fixture}.json`)
  if (!fs.existsSync(goldenPath)) continue
  console.log(`skipping context golden (manual review needed): ${fixture}`)
}
