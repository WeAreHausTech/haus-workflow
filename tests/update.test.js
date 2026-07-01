import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { execaSync } from 'execa'

import { runFromHookCheck } from '../src/commands/update.js'
import { hashText } from '../src/utils/fs.js'
import { EMPTY_LOCK_PATHS_TOKEN } from '../src/update/hash-installed.js'

test('update check and apply create backup', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'update-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.2.0',
          hash: hashText(EMPTY_LOCK_PATHS_TOKEN),
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )

  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  const checkOut = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--check'], {
    cwd: temp,
    env,
    reject: false,
  }).stdout
  assert.equal(checkOut.includes('"ok": true') || checkOut.includes('"ok":true'), true)

  const out = execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env }).stdout
  const backups = readdirSync(path.join(temp, '.haus-workflow/backups'))
  const lock = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))

  assert.equal(backups.length > 0, true)
  assert.equal(typeof lock[0].hash, 'string')
  assert.equal(lock[0].hash.startsWith('sha256-'), true)
  assert.equal(Array.isArray(lock[0].paths), true)
  assert.equal(
    out.includes('Lock item changes') ||
      out.includes('Lock changed:') ||
      out.includes('No lockfile changes.'),
    true,
  )
})

// Regression: an un-set-up project (no haus.lock.json) must NOT make
// `haus update --check` exit non-zero. checkLock returns ok:false for an empty
// lockfile, but that means "not set up by haus", not "drift" — only real drift
// (an existing lock whose hashes no longer match) should fail the check.
test('update --check exits 0 on a project that was never set up (no lockfile)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-nolock-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'nolock-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--check'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 0, 'no lockfile is not a failure')
})

test('update --check output includes npmVersion field', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-npmver-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'npmver-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  // Valid lock item so checkLock returns ok:true and exit code is 0.
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.1.0',
          hash: hashText(EMPTY_LOCK_PATHS_TOKEN),
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )

  const r = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--check'], {
    cwd: temp,
    reject: false,
    env: {
      HAUS_TEST_MODE: '1',
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
      HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
      HOME: path.join(temp, 'home'),
      USERPROFILE: path.join(temp, 'home'),
    },
  })
  assert.equal(r.exitCode, 0)
  const parsed = JSON.parse(r.stdout)
  assert.equal('npmVersion' in parsed, true)
  assert.equal(typeof parsed.npmVersion.current, 'string')
  assert.equal(typeof parsed.npmVersion.updateAvailable, 'boolean')
  assert.ok(parsed.npmVersion.latest === null || typeof parsed.npmVersion.latest === 'string')
})

test('update recomputes hash from tracked file paths', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-paths-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  mkdirSync(path.join(temp, '.claude'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'update-paths', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(path.join(temp, '.claude/tracked.md'), 'content-v1')
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.1.0',
          hash: 'sha256-stale',
          installMode: 'copied',
          paths: ['.claude/tracked.md'],
        },
      ],
      null,
      2,
    ),
  )

  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env })
  const lock1 = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
  const h1 = lock1[0].hash
  assert.equal(h1.startsWith('sha256-'), true)
  assert.notEqual(h1, 'sha256-stale')

  writeFileSync(path.join(temp, '.claude/tracked.md'), 'content-v2')
  execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env })
  const lock2 = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
  assert.notEqual(lock2[0].hash, h1)
})

test('update refreshes ~/.claude global files', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-global-'))
  const home = path.join(temp, 'home')
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'update-global', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.1.0',
          hash: 'sha256-x',
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )

  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: home,
    USERPROFILE: home,
  }
  const out = execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env }).stdout

  // The global install manifest is written only when ~/.claude was actually seeded.
  const manifest = JSON.parse(
    readFileSync(path.join(home, '.claude/haus/install-manifest.json'), 'utf8'),
  )
  assert.equal(manifest.files.length > 0, true)
  assert.equal(out.includes('Refreshing ~/.claude/ global files...'), true)
})

test('update re-applies project files and preserves user settings merge', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-project-'))
  const home = path.join(temp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'update-project', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: home,
    USERPROFILE: home,
  }
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'apply', '--write', '--allow-empty-cache'], { cwd: temp, env })

  writeFileSync(path.join(temp, '.claude/rules/haus.md'), 'stale override')
  const settingsBefore = JSON.parse(readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))
  settingsBefore.hooks.PreToolUse.push({
    matcher: 'Custom',
    hooks: [{ type: 'command', command: 'echo user-hook' }],
  })
  writeFileSync(
    path.join(temp, '.claude/settings.json'),
    `${JSON.stringify(settingsBefore, null, 2)}\n`,
  )

  const out = execaSync('node', [cli, 'update'], { cwd: temp, env }).stdout
  // Security lines are folded into the managed haus.md rule; update restores it after tamper.
  const rulesHaus = readFileSync(path.join(temp, '.claude/rules/haus.md'), 'utf8')
  const settingsAfter = JSON.parse(readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))

  assert.equal(rulesHaus.includes('Never read secrets'), true)
  assert.equal(
    settingsAfter.hooks.PreToolUse.some((e) => e.matcher === 'Custom'),
    true,
  )
  assert.equal(
    settingsAfter.hooks.PreToolUse.some((e) => e.matcher === 'Read|Edit|Write'),
    true,
  )
  assert.equal(out.includes('Refreshing project .claude/ files...'), true)
  assert.equal(out.includes('Project refreshed:'), true)
})

test('update --from-hook is silent for a project that was never set up (no lockfile)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-hook-nolock-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'hook-nolock-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_SKIP_NPM_CHECK: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--from-hook'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 0, 'a failed/skipped hook check must never fail the session')
  assert.equal(r.stdout.trim(), '', 'no lockfile means nothing to nudge about — stay silent')
})

// `update --from-hook` now only checks the cheap lock summary (count + catalogRef, no
// per-item content hashing — see readLockSummary) plus the npm/catalog version checks, so
// this exercises the "has a real lock, but nothing is actually behind" silent path — the
// hash-drift signal that used to also feed this hook was removed for cost (Copilot review);
// `haus doctor`/`project:fix` remain the tools for catching local file drift.
test('update --from-hook is silent for a healthy project with a real lock', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-hook-healthy-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'hook-healthy-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.1.0',
          hash: hashText(EMPTY_LOCK_PATHS_TOKEN),
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )
  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_SKIP_NPM_CHECK: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--from-hook'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 0)
  assert.equal(r.stdout.trim(), '', 'nothing is behind — stay silent')
})

// Direct unit test (in-process, mocked fetch — same style as tests/npm-version.test.js)
// rather than a CLI subprocess: there is no offline way to force `fetchLatestCatalogTag`
// or `fetchNpmVersionStatus` to report "behind" via env vars alone (HAUS_CATALOG_REMOTE_BASE
// only ever short-circuits fetchLatestCatalogTag to null in test mode), so this proves the
// "behind" branch and its exact JSON shape without depending on live network state.
test('runFromHookCheck emits a SessionStart note when npm reports a newer version', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-hook-npm-behind-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'x',
          type: 'skill',
          source: 'haus',
          version: '0.1.0',
          hash: hashText(EMPTY_LOCK_PATHS_TOKEN),
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )

  const prevFetch = globalThis.fetch
  const prevEnv = { ...process.env }
  const prevLog = console.log
  const logs = []
  console.log = (msg) => logs.push(msg) // eslint-disable-line no-console
  globalThis.fetch = async (url) => {
    if (String(url).includes('registry.npmjs.org')) {
      return { ok: true, json: async () => ({ version: '999.0.0' }) }
    }
    throw new Error(`unexpected fetch() call in test: ${url}`)
  }
  process.env.HAUS_TEST_MODE = '1'
  // Short-circuits fetchLatestCatalogTag() to null so only the npm-behind reason fires —
  // must NOT set HAUS_SKIP_NPM_CHECK here, or the mocked fetch above is never exercised.
  process.env.HAUS_CATALOG_REMOTE_BASE = 'http://127.0.0.1:0'
  delete process.env.HAUS_SKIP_NPM_CHECK

  try {
    await runFromHookCheck(temp)
  } finally {
    globalThis.fetch = prevFetch
    console.log = prevLog
    process.env = prevEnv
  }

  assert.equal(logs.length, 1, 'exactly one hook JSON line should be printed')
  const parsed = JSON.parse(logs[0])
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(parsed.hookSpecificOutput.additionalContext, /project:refresh/)
  assert.match(parsed.hookSpecificOutput.additionalContext, /999\.0\.0/)
})

test('update skips project re-apply when no prior haus setup', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-noproj-'))
  const home = path.join(temp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'no-haus', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = {
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: home,
    USERPROFILE: home,
  }
  const out = execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env }).stdout
  assert.equal(out.includes('No prior haus project setup detected'), true)
  assert.equal(existsSync(path.join(temp, '.claude')), false)
})
