/**
 * Cross-repo validator behavior-parity test (ADR-0024). Skips cleanly (does not
 * fail) when no haus-workflow-catalog checkout is available — this is the offline
 * "run in yarn test" half of the check; scripts/contract-behavior-check.mjs (with
 * CONTRACT_STRICT=1 in CI on main push/cron) is what actually enforces it hard.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findCatalogValidateCore,
  resolveCatalogRepoPath,
  runContractBehaviorCheck,
} from '../scripts/contract-behavior-check.mjs'

const catalogRepoPath = resolveCatalogRepoPath()
const catalogValidateCorePath = findCatalogValidateCore(catalogRepoPath)

test(
  'both validators agree on every fixture in tests/fixtures/contract-behavior/',
  { skip: !catalogValidateCorePath && 'no haus-workflow-catalog checkout found (set HAUS_CATALOG_REPO_PATH)' },
  async () => {
    const mismatches = await runContractBehaviorCheck(catalogValidateCorePath)
    assert.deepEqual(mismatches, [])
  },
)
