#!/usr/bin/env node
/**
 * Shared test runner: compact progress, failure digest at end.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reporter = path.join(repoRoot, 'scripts/test-failure-summary-reporter.mjs')
const files = process.argv.slice(2)

if (files.length === 0) {
  console.error('run-tests: no test files given')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter', reporter, ...files],
  { cwd: repoRoot, stdio: 'inherit' },
)

process.exit(result.status ?? 1)
