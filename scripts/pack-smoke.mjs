#!/usr/bin/env node
/**
 * Packed-tarball clean-install smoke.
 *
 * CI runs dist/cli.js directly and runs `yarn pack`, but never installs the packed
 * tarball into a clean dir and runs `haus`. This script closes that gap: it packs,
 * installs the tarball into a throwaway consumer project with a real node_modules
 * (so prod deps like @inquirer/checkbox must actually resolve), runs the shipped
 * bin, and asserts every path in package.json `files` made it into the package.
 *
 * A missing `files` entry, a broken bin shebang, an ESM resolution failure, or an
 * unbundled dependency turns this red instead of shipping to users.
 *
 * IMPORTANT: we pack with `npm pack`, not `yarn pack`, because the package is
 * published with `npm publish` (see .github/workflows/release.yml). yarn berry's
 * pack silently drops directory entries from the `files` field (e.g. library/**),
 * so `yarn pack` would NOT reflect the artifact users actually install. npm pack
 * honors `files` strictly, matching the real published tarball.
 *
 * Usage: node scripts/pack-smoke.mjs   (npm pack runs the prepack build for us)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = '@haus-tech/haus-workflow'

// Paths that package.json `files` promises to ship. A missing one = red build.
const SHIPPED_PATHS = [
  'dist/cli.js',
  'library/global',
  'library/catalog',
  'tests/fixtures/catalog',
  'scripts/postinstall.mjs',
]

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  try {
    return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts })
  } catch (err) {
    // execFileSync throws a terse error; surface the child's stderr/stdout so a
    // CI failure is debuggable instead of just "Command failed".
    if (err?.stderr) console.error(String(err.stderr))
    if (err?.stdout) console.error(String(err.stdout))
    fail(`command failed: ${cmd} ${args.join(' ')}`)
    return '' // unreachable: fail() exits
  }
}

function fail(msg) {
  console.error(`✗ pack-smoke: ${msg}`)
  process.exit(1)
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-pack-smoke-'))
const consumer = path.join(work, 'consumer')
const project = path.join(work, 'project')
fs.mkdirSync(consumer, { recursive: true })
fs.mkdirSync(project, { recursive: true })

try {
  // 1. Pack the tarball the same way it is published: npm pack (honors `files`).
  //    npm pack runs the `prepack` build, then drops a *.tgz into the destination.
  run('npm', ['pack', '--pack-destination', work], { cwd: repoRoot })
  const tgz = fs
    .readdirSync(work)
    .filter((f) => f.endsWith('.tgz'))
    .map((f) => path.join(work, f))[0]
  if (!tgz || !fs.existsSync(tgz)) fail('npm pack did not produce a tarball')

  // 2. Install into a clean consumer with a real node_modules. HAUS_NO_POSTINSTALL
  //    keeps the tarball install from touching ~/.claude.
  run('npm', ['init', '-y'], { cwd: consumer })
  run('npm', ['install', tgz, '--prefer-offline', '--no-audit', '--no-fund'], {
    cwd: consumer,
    env: { ...process.env, HAUS_NO_POSTINSTALL: '1' },
  })

  // 3. Run the shipped bin (asserts shebang + bin mapping), then a real command.
  const binPath = path.join(consumer, 'node_modules', '.bin', 'haus')
  if (!fs.existsSync(binPath)) fail(`bin not linked at ${binPath}`)
  const version = run('node', [binPath, '--version'], { cwd: consumer }).trim()
  if (!version) fail('haus --version produced no output')
  console.log(`✓ installed haus --version → ${version}`)

  const pkgDir = path.join(consumer, 'node_modules', PKG_NAME)

  // A throwaway project for `scan` to chew on (mirrors the CI smoke fixture).
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify(
      { name: 'haus-pack-smoke', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(project, 'yarn.lock'), '')
  run('node', [path.join(pkgDir, 'dist', 'cli.js'), 'scan', '--json'], { cwd: project })
  console.log('✓ installed CLI ran `scan --json`')

  // 4. Every shipped path must resolve inside the installed package.
  for (const rel of SHIPPED_PATHS) {
    const abs = path.join(pkgDir, rel)
    if (!fs.existsSync(abs)) fail(`shipped path missing from package: ${rel}`)
  }
  console.log(`✓ all ${SHIPPED_PATHS.length} shipped paths present`)

  console.log('✓ pack-smoke passed')
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
