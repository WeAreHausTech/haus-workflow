import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

const cli = () => path.resolve('dist/cli.js')
const cred = (key, val, sep = '=') => `${key}${sep}${val}`
const fixtureEnv = (extra = {}) => ({
  ...process.env,
  HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
  ...extra,
})

function seedProject(temp) {
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'cli-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
}

test('validate-catalog CLI validates bundled fixture manifest', () => {
  const manifest = path.resolve('tests/fixtures/catalog/manifest.json')
  const r = execaSync('node', [cli(), 'validate-catalog', manifest], { reject: false })
  assert.equal(r.exitCode, 0)
  assert.match(r.stdout ?? '', /Catalog valid/)
})

test('validate-catalog CLI fails on missing manifest', () => {
  const r = execaSync('node', [cli(), 'validate-catalog'], { reject: false })
  assert.equal(r.exitCode, 1)
})

test('context CLI emits JSON after scan and recommend', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-context-cli-'))
  seedProject(temp)
  const env = fixtureEnv()
  execaSync('node', [cli(), 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli(), 'recommend', '--json'], { cwd: temp, env })
  const r = execaSync('node', [cli(), 'context', '--json', '--task', 'fix lint errors'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 0)
  const parsed = JSON.parse(r.stdout)
  assert.ok(Array.isArray(parsed.selectedRules))
})

test('context CLI redacts secrets in hook-style output', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-context-redact-'))
  seedProject(temp)
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(temp, '.haus-workflow/recommendation.json'),
    JSON.stringify(
      {
        mode: 'fast',
        recommended: [],
        skipped: [],
        warnings: [],
        estimatedContextTokens: 0,
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/context-map.json'),
    JSON.stringify(
      {
        mode: 'fast',
        generatedAt: new Date().toISOString(),
        root: temp,
        repoName: 'cli-temp',
        packageManager: 'yarn',
        repoRoles: [],
        detectedStacks: {},
        dependencies: [],
        securityRisks: [],
        crossRepoHints: [],
        warnings: [],
        detectionStatus: 'supported',
        unsupportedSignals: [],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/repo-summary.md'),
    `${cred('api_key', 'supersecretvalue')}\n`,
    'utf8',
  )
  const r = execaSync('node', [cli(), 'context'], { cwd: temp, reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').includes('supersecretvalue'), false)
  assert.match(r.stdout ?? '', /\[REDACTED\]/)
})

test('guard bash CLI denies dangerous command from stdin payload', () => {
  const payload = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/x' } })
  const r = execaSync('node', [cli(), 'guard', 'bash', '--from-hook'], {
    input: payload,
    reject: false,
  })
  assert.equal(r.exitCode, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.permissionDecision, 'deny')
})

test('guard file-access CLI allows ordinary paths', () => {
  const payload = JSON.stringify({ tool_input: { path: 'src/index.ts' } })
  const r = execaSync('node', [cli(), 'guard', 'file-access', '--from-hook'], {
    input: payload,
    reject: false,
  })
  assert.equal(r.exitCode, 0)
})

test('refresh CLI rescans and writes recommendation.json', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-refresh-cli-'))
  seedProject(temp)
  const env = fixtureEnv()
  const r = execaSync('node', [cli(), 'refresh'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 0)
  assert.match(r.stdout ?? '', /Haus refresh complete/)
  assert.ok(fs.existsSync(path.join(temp, '.haus-workflow/recommendation.json')))
  assert.ok(fs.existsSync(path.join(temp, '.haus-workflow/sources-report.json')))
})

test('uninstall CLI removes global haus files from stub HOME', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'haus-uninstall-home-'))
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-uninstall-proj-'))
  seedProject(temp)
  const env = {
    ...fixtureEnv(),
    HOME: home,
    USERPROFILE: home,
  }
  execaSync('node', [cli(), 'install'], { cwd: temp, env })
  assert.ok(fs.existsSync(path.join(home, '.claude')))
  const r = execaSync('node', [cli(), 'uninstall', '--force'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 0)
  assert.match(r.stdout ?? '', /haus uninstall complete/)
})

test('update --check reports driftCount when lock hash is stale', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-update-drift-'))
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  mkdirSync(path.join(temp, '.claude'), { recursive: true })
  writeFileSync(path.join(temp, '.claude/a.md'), 'live content', 'utf8')
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'drift-temp', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(
    path.join(temp, '.haus-workflow/haus.lock.json'),
    JSON.stringify(
      [
        {
          id: 'skill.x',
          type: 'skill',
          version: '1.0.0',
          hash: 'sha256-stale',
          paths: ['.claude/a.md'],
        },
      ],
      null,
      2,
    ),
  )
  const r = execaSync('node', [cli(), 'update', '--check'], {
    cwd: temp,
    reject: false,
    env: {
      ...process.env,
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
      HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
      HOME: path.join(temp, 'home'),
      USERPROFILE: path.join(temp, 'home'),
    },
  })
  assert.equal(r.exitCode, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.driftCount, 1)
  assert.equal(parsed.drift[0].id, 'skill.x')
})
