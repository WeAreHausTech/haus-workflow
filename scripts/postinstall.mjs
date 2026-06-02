#!/usr/bin/env node
/**
 * npm postinstall hook. On a GLOBAL install of @haus-tech/haus-workflow, runs
 * `haus install --postinstall` automatically so a non-developer gets a working
 * Claude Code setup with zero manual steps — then the CLI prints exactly what it
 * changed in ~/.claude and how to undo it.
 *
 * Fail-open by design: this must NEVER break `npm install`. Every gate that isn't
 * satisfied is a silent no-op, and the whole body is wrapped so any error still
 * exits 0. Plain Node ESM (no tsx) because consumers don't have the dev toolchain.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pure gate: decides whether the postinstall should run. Kept side-effect-free and
 * exported so it can be unit-tested across the full env/fs matrix without spawning npm.
 *
 * @param {{ env: Record<string, string | undefined>, distExists: boolean, srcExists: boolean }} input
 * @returns {{ run: boolean, reason: string }}
 */
export function shouldRunPostinstall({ env, distExists, srcExists }) {
  if (env.npm_config_global !== 'true') return { run: false, reason: 'not a global install' }
  if (env.CI) return { run: false, reason: 'CI environment' }
  if (env.HAUS_NO_POSTINSTALL === '1') return { run: false, reason: 'HAUS_NO_POSTINSTALL=1' }
  if (!distExists) return { run: false, reason: 'dist/cli.js missing' }
  // Published tarballs omit src/; its presence means we're in the package's own
  // dev checkout, where a local `yarn install` must not self-trigger.
  if (srcExists) return { run: false, reason: 'running inside the package dev checkout' }
  return { run: true, reason: 'global install' }
}

/** Entry point: runs only when this file is invoked directly (not when imported by a test). */
function main() {
  try {
    const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const cliPath = path.join(pkgRoot, 'dist', 'cli.js')
    const decision = shouldRunPostinstall({
      env: process.env,
      distExists: fs.existsSync(cliPath),
      srcExists: fs.existsSync(path.join(pkgRoot, 'src')),
    })

    if (!decision.run) {
      if (process.env.HAUS_DEBUG) console.error(`[haus postinstall] skipped: ${decision.reason}`)
      process.exit(0)
    }

    // Non-fatal: a nonzero CLI exit must not fail `npm install`.
    spawnSync(process.execPath, [cliPath, 'install', '--postinstall'], { stdio: 'inherit' })
  } catch (err) {
    if (process.env.HAUS_DEBUG) console.error(`[haus postinstall] error (ignored): ${err}`)
  }
  process.exit(0)
}

// Run only as a script, never when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}
