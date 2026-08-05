#!/usr/bin/env node
/**
 * Full local gate: typecheck ∥ lint ∥ build, then test.
 * Parallel first wave saves wall time vs sequential yarn verify chain.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {string} script package.json script name
 * @returns {Promise<number>} exit code
 */
function runYarn(script) {
  return new Promise((resolve) => {
    const child = spawn('yarn', [script], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('exit', (code, signal) => {
      if (signal) resolve(1)
      else resolve(code ?? 1)
    })
    child.on('error', () => resolve(1))
  })
}

const coverage = process.argv.includes('--coverage')

const parallel = await Promise.all([runYarn('typecheck'), runYarn('lint'), runYarn('build')])
const parallelFailed = parallel.some((code) => code !== 0)
if (parallelFailed) {
  process.exit(1)
}

// verify:full uses coverage:check so the suite runs once under c8 (not verify then coverage again).
const testCode = await runYarn(coverage ? 'coverage:check' : 'test')
process.exit(testCode)
