#!/usr/bin/env node
/**
 * Pre-push fast test gate: unit tests only. Integration / CLI / git / fixture-heavy
 * files are excluded — CI runs the full suite with coverage.
 *
 * Add new integration tests to SLOW_INTEGRATION below.
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = path.join(repoRoot, 'tests')

/** @type {ReadonlySet<string>} */
const SLOW_INTEGRATION = new Set([
  'apply-select.test.js',
  'apply.test.js',
  'cache-preserves-version.test.js',
  'cleanup-stale-items.test.js',
  'clone.test.js',
  'commands-cli.test.js',
  'deep-context-enrichment.test.js',
  'derive-workflow-config.test.js',
  'detection-characterization.test.js',
  'detection-status.test.js',
  'doctor.test.js',
  'frontmatter-integrity.test.js',
  'generated-primitives-shape.test.js',
  'git-signal.test.js',
  'guard-hook-contract.test.js',
  'infrastructure-utils.test.js',
  'ingest-catalog.test.js',
  'init.test.js',
  'install-postinstall-notice.test.js',
  'install-roundtrip.test.js',
  'install-skill-frontmatter.test.js',
  'install.test.js',
  'load-catalog.test.js',
  'postinstall.test.js',
  'recommend-eligibility.test.js',
  'remote-catalog-tree.test.js',
  'remote-catalog.test.js',
  'setup-core.test.js',
  'setup-project.test.js',
  'sources-report.test.js',
  'superpowers-install.test.js',
  'undo.test.js',
  'update.test.js',
  'validate-catalog-regression.test.js',
  'workspace-discover.test.js',
  'workspace-doctor.test.js',
  'workspace-setup.test.js',
  'workspace.test.js',
  'write-root-claude-md.test.js',
  'write-workflow.test.js',
])

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.js') && !SLOW_INTEGRATION.has(name))
  .sort()
  .map((name) => path.join(testsDir, name))

if (files.length === 0) {
  console.error('test-fast: no test files selected')
  process.exit(1)
}

const runTests = path.join(repoRoot, 'scripts/run-tests.mjs')

const result = spawnSync(process.execPath, [runTests, ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
