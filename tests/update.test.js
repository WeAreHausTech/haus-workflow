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
          hash: 'sha256-old',
          installMode: 'copied',
          paths: [],
        },
      ],
      null,
      2,
    ),
  )

  const env = {
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  const checkOut = execaSync('node', [path.resolve('dist/cli.js'), 'update', '--check'], {
    cwd: temp,
    env,
  }).stdout
  assert.equal(checkOut.includes('"ok"'), true)

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
          hash: 'sha256-abc',
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

  writeFileSync(path.join(temp, '.claude/rules/security.md'), 'stale override')
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
  const security = readFileSync(path.join(temp, '.claude/rules/security.md'), 'utf8')
  const settingsAfter = JSON.parse(readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))

  assert.equal(security.includes('Never read secrets'), true)
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

test('update skips project re-apply when no prior haus setup', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-noproj-'))
  const home = path.join(temp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'no-haus', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = {
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: home,
    USERPROFILE: home,
  }
  const out = execaSync('node', [path.resolve('dist/cli.js'), 'update'], { cwd: temp, env }).stdout
  assert.equal(out.includes('No prior haus project setup detected'), true)
  assert.equal(existsSync(path.join(temp, '.claude')), false)
})
