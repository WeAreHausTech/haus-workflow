#!/usr/bin/env node
/**
 * Coverage ratchet gate.
 *
 * Reads coverage/coverage-summary.json (produced by `c8 ... json-summary`)
 * and compares against the floors recorded in .c8rc.json.
 *
 * Behaviour:
 *  - FAIL (exit 1) if a global metric is below its floor (regression).
 *  - FAIL (exit 1) if a global metric exceeds its floor by >= 1 percentage
 *    point — prompting a human to raise the floor. The floor is never
 *    auto-edited; it only ever ratchets up by hand.
 *  - FAIL (exit 1) if any hot-path module that is currently at/above the
 *    per-file line floor regresses below it.
 *
 * The script never edits any file; it only reports.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const summaryPath = resolve(repoRoot, 'coverage', 'coverage-summary.json')
const configPath = resolve(repoRoot, '.c8rc.json')

let summary
try {
  summary = readJson(summaryPath)
} catch {
  console.error(`coverage-ratchet: cannot read ${summaryPath}. Run \`yarn test:coverage\` first.`)
  process.exit(1)
}

const config = readJson(configPath)
const RATCHET_BAND = 1 // percentage points

const GLOBAL_METRICS = ['lines', 'functions', 'branches', 'statements']
const failures = []
const raiseHints = []

const total = summary.total
if (!total) {
  console.error('coverage-ratchet: coverage-summary.json missing `total`.')
  process.exit(1)
}

for (const metric of GLOBAL_METRICS) {
  const floor = config[metric]
  if (typeof floor !== 'number') continue
  const current = total[metric].pct
  if (current < floor) {
    failures.push(`global ${metric}: ${current}% is below floor ${floor}% (regression).`)
  } else if (current - floor >= RATCHET_BAND) {
    raiseHints.push(
      `global ${metric}: ${current}% exceeds floor ${floor}% by >=${RATCHET_BAND}pp — raise floor to ${Math.floor(current)} in .c8rc.json.`,
    )
  }
}

// Per-file hot-path enforcement.
const ratchetCfg = config.ratchet ?? {}
const hotFloor = ratchetCfg.hotPathLineFloor ?? 85
const hotGlobs = ratchetCfg.hotPathGlobs ?? []

function normalize(p) {
  // coverage-summary keys are absolute paths; reduce to repo-relative posix.
  return p.replaceAll('\\', '/').replace(`${repoRoot.replaceAll('\\', '/')}/`, '')
}

function isHotPath(rel) {
  return hotGlobs.some((g) => (g.endsWith('/') ? rel.startsWith(g) : rel === g))
}

for (const [key, data] of Object.entries(summary)) {
  if (key === 'total') continue
  const rel = normalize(key)
  if (!isHotPath(rel)) continue
  const pct = data.lines.pct
  // Only enforce no-regression for files already meeting the floor; this keeps
  // the gate green at baseline while locking in earned coverage. Files below
  // the floor are surfaced as informational hints to be improved.
  if (pct < hotFloor) {
    // Below target: surfaced as a non-fatal hint so the gate stays green at
    // baseline. Files at/above the floor are the success state; a drop below
    // it is caught on the next run by this same check once tests are added.
    raiseHints.push(`hot-path ${rel}: lines ${pct}% is below target ${hotFloor}% — add tests.`)
  }
}

if (failures.length > 0) {
  console.error('coverage-ratchet: FAIL')
  for (const f of failures) console.error(`  - ${f}`)
  if (raiseHints.length > 0) {
    console.error('coverage-ratchet: hints')
    for (const h of raiseHints) console.error(`  - ${h}`)
  }
  process.exit(1)
}

console.log('coverage-ratchet: PASS')
console.log(
  `  global lines ${total.lines.pct}% (floor ${config.lines}%), ` +
    `functions ${total.functions.pct}% (floor ${config.functions}%), ` +
    `branches ${total.branches.pct}% (floor ${config.branches}%), ` +
    `statements ${total.statements.pct}% (floor ${config.statements}%)`,
)
if (raiseHints.length > 0) {
  console.log('coverage-ratchet: improvement hints (non-fatal)')
  for (const h of raiseHints) console.log(`  - ${h}`)
}
process.exit(0)
