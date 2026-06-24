#!/usr/bin/env node
/**
 * CI helper: run `haus decisions check` against a git range.
 * Usage: node scripts/decisions-gate.mjs --range origin/main..HEAD
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repoRoot, 'dist/cli.js')

const rangeIdx = process.argv.indexOf('--range')
const range = rangeIdx >= 0 ? process.argv[rangeIdx + 1] : undefined
const args = ['decisions', 'check', ...(range ? ['--range', range] : [])]

const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
