#!/usr/bin/env node
/**
 * Cross-repo validator behavior-parity check (ADR-0024). ADR-0005's
 * contract-check.mjs already catches DATA/SCHEMA drift between this repo and
 * haus-workflow-catalog (validation-rules.json byte match, fixture key-set vs.
 * live schema). It never runs the two validators' actual audit LOGIC against the
 * same items — so a rule added to one side's hand-written audit function and
 * forgotten on the other stays invisible even with rule data perfectly in sync
 * (exactly what happened with auditSafetyNotes/auditIntents/auditDiskOrphans
 * before this repo's own copies existed).
 *
 * This script runs both `haus-workflow-catalog/scripts/validate-core.mjs`
 * (live, dynamically imported from a sibling checkout) and this repo's own
 * `src/catalog/validate-core.ts` against the SAME shared fixture set
 * (tests/fixtures/contract-behavior/) and asserts they agree on every item's
 * pass/fail verdict.
 *
 * Degrades gracefully when the sibling checkout isn't available (WARN + exit 0)
 * unless CONTRACT_STRICT=1, matching ADR-0005's contract-check.mjs model.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export const FIXTURE_ROOT = path.join(repoRoot, 'tests', 'fixtures', 'contract-behavior')
export const FIXTURE_SETS = [
  { name: 'clean', expectOk: true },
  { name: 'bad', expectOk: false },
  // Zero manifest items, one file on disk — a disk-orphan failure is the ONLY
  // possible signal here. perItemVerdicts() only compares item-scoped failures
  // (those starting with "${item.id}:"), so with no items at all, disk-orphan
  // parity would otherwise be invisible to the per-item comparison and could
  // only be masked by other items' failures in the "bad" set coincidentally
  // matching overall ok=false on both sides. This set isolates it: the overall
  // ok comparison below is what actually catches a regression here.
  { name: 'orphan-only', expectOk: false },
]

// The default guess assumes `repoRoot` is this repo's real checkout root
// (sibling to haus-workflow-catalog). Under a git worktree
// (.claude/worktrees/<name>/), repoRoot is nested one or more levels deeper, so
// also try walking up further — cheap, and CI always sets
// HAUS_CATALOG_REPO_PATH explicitly rather than relying on this guess anyway.
export function resolveCatalogRepoPath() {
  if (process.env.HAUS_CATALOG_REPO_PATH) return path.resolve(process.env.HAUS_CATALOG_REPO_PATH)
  for (const depth of [1, 2, 3, 4]) {
    const candidate = path.resolve(repoRoot, ...Array(depth).fill('..'), 'haus-workflow-catalog')
    if (fs.existsSync(path.join(candidate, 'scripts', 'validate-core.mjs'))) return candidate
  }
  // Nothing found — return the shallowest guess so the caller's "not found"
  // message names a sensible path.
  return path.resolve(repoRoot, '..', 'haus-workflow-catalog')
}

export function findCatalogValidateCore(catalogRepoPath) {
  const p = path.join(catalogRepoPath, 'scripts', 'validate-core.mjs')
  return fs.existsSync(p) ? p : null
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
}

/** Per-item verdict: true = validator flagged at least one failure naming this item. */
function perItemVerdicts(items, failures) {
  const verdicts = new Map()
  for (const item of items) {
    const flagged = failures.some((f) => f.startsWith(`${item.id}:`))
    verdicts.set(item.id, flagged)
  }
  return verdicts
}

/**
 * Runs both validators against every fixture set and returns the list of
 * mismatches (empty = full agreement). Pure — no process.exit, no console
 * output — so both the CLI entrypoint below and tests/contract-behavior.test.js
 * can call it directly.
 */
export async function runContractBehaviorCheck(catalogValidateCorePath) {
  const { validateCatalog } = await import(pathToFileURL(catalogValidateCorePath).href)
  const { validateCatalogData } = await import(
    pathToFileURL(path.join(repoRoot, 'src', 'catalog', 'validate-core.ts')).href
  )

  const mismatches = []

  for (const set of FIXTURE_SETS) {
    const root = path.join(FIXTURE_ROOT, set.name)
    const manifest = readManifest(root)

    const catalogResult = validateCatalog(root, manifest)
    const cliResult = validateCatalogData(root, manifest.version, manifest.items)

    if (catalogResult.ok !== set.expectOk) {
      mismatches.push(
        `fixture "${set.name}": catalog validator ok=${catalogResult.ok}, expected ${set.expectOk} — fixture itself may be wrong, not a cross-validator mismatch`,
      )
    }
    if (cliResult.ok !== set.expectOk) {
      mismatches.push(
        `fixture "${set.name}": CLI validator ok=${cliResult.ok}, expected ${set.expectOk} — fixture itself may be wrong, not a cross-validator mismatch`,
      )
    }

    if (catalogResult.ok !== cliResult.ok) {
      mismatches.push(
        `fixture "${set.name}": overall verdict diverges — catalog ok=${catalogResult.ok}, CLI ok=${cliResult.ok}`,
      )
    }

    const catalogVerdicts = perItemVerdicts(manifest.items, catalogResult.failures)
    const cliVerdicts = perItemVerdicts(manifest.items, cliResult.failures)
    for (const item of manifest.items) {
      const catalogFlagged = catalogVerdicts.get(item.id)
      const cliFlagged = cliVerdicts.get(item.id)
      if (catalogFlagged !== cliFlagged) {
        mismatches.push(
          `fixture "${set.name}", item "${item.id}": catalog flagged=${catalogFlagged}, CLI flagged=${cliFlagged}`,
        )
      }
    }
  }

  return mismatches
}

async function main() {
  const strict = process.env.CONTRACT_STRICT === '1'
  const catalogRepoPath = resolveCatalogRepoPath()
  const catalogValidateCorePath = findCatalogValidateCore(catalogRepoPath)

  if (!catalogValidateCorePath) {
    console.warn(
      `contract-behavior-check: catalog repo not found at ${catalogRepoPath} (checked ` +
        'scripts/validate-core.mjs). Set HAUS_CATALOG_REPO_PATH to a haus-workflow-catalog ' +
        'checkout, or run with a sibling checkout present. Skipping (see ADR-0024).',
    )
    process.exit(strict ? 1 : 0)
    return
  }

  const mismatches = await runContractBehaviorCheck(catalogValidateCorePath)

  if (mismatches.length > 0) {
    const log = strict ? console.error : console.warn
    log(
      `contract-behavior-check: validator verdicts diverge${strict ? '' : ' (non-strict — see below)'}:\n`,
    )
    for (const m of mismatches) log(`  - ${m}`)
    process.exit(strict ? 1 : 0)
    return
  }

  console.log(
    `contract-behavior-check: OK — both validators agree on all ${FIXTURE_SETS.length} fixture sets (catalog: ${catalogRepoPath})`,
  )
}

// Only run when this file is the actual process entrypoint, not when imported
// by tests/contract-behavior.test.js.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) await main()
