import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import {
  checkLock,
  applyLock,
  diffLock,
  hasLocalOverrides,
  readLockSummary,
} from '../src/update/lockfile.js'
import { hashText } from '../src/utils/fs.js'
import { EMPTY_LOCK_PATHS_TOKEN } from '../src/update/hash-installed.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-lock-test-'))
  // Ensure .haus-workflow/ exists so tests can write the lockfile
  fs.mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---- helpers ----------------------------------------------------------------

function writeLock(items) {
  fs.writeFileSync(
    path.join(tmpDir, '.haus-workflow', 'haus.lock.json'),
    JSON.stringify(items, null, 2) + '\n',
    'utf8',
  )
}

// ---- checkLock --------------------------------------------------------------

test('checkLock: missing lock file returns ok:false, count:0, catalogRef:null', async () => {
  // do not write a lockfile
  const result = await checkLock(tmpDir)
  assert.deepEqual(result, { ok: false, count: 0, catalogRef: null, drift: [], driftCount: 0 })
})

test('checkLock: empty array returns ok:false, count:0, catalogRef:null', async () => {
  writeLock([])
  const result = await checkLock(tmpDir)
  assert.deepEqual(result, { ok: false, count: 0, catalogRef: null, drift: [], driftCount: 0 })
})

test('checkLock: valid items with no versions returns ok:true', async () => {
  writeLock([
    { id: 'skill.foo', type: 'skill' },
    { id: 'skill.bar', type: 'skill' },
  ])
  const result = await checkLock(tmpDir)
  assert.equal(result.ok, true)
  assert.equal(result.count, 2)
})

test('checkLock: valid semver versions returns ok:true', async () => {
  writeLock([{ id: 'skill.foo', type: 'skill', version: '1.2.3' }])
  const result = await checkLock(tmpDir)
  assert.equal(result.ok, true)
  assert.equal(result.count, 1)
})

test('checkLock: invalid version string returns ok:false', async () => {
  writeLock([{ id: 'skill.foo', type: 'skill', version: 'not-a-version' }])
  const result = await checkLock(tmpDir)
  assert.equal(result.ok, false)
})

test('checkLock: catalogRef is taken from first item', async () => {
  writeLock([
    { id: 'skill.a', type: 'skill', catalogRef: 'v1.2.3' },
    { id: 'skill.b', type: 'skill', catalogRef: 'v1.2.3' },
  ])
  const result = await checkLock(tmpDir)
  assert.equal(result.catalogRef, 'v1.2.3')
})

test('checkLock: multiple items all sharing catalogRef returns first item catalogRef', async () => {
  writeLock([
    { id: 'skill.a', type: 'skill', catalogRef: 'main' },
    { id: 'skill.b', type: 'skill', catalogRef: 'main' },
    { id: 'skill.c', type: 'skill', catalogRef: 'main' },
  ])
  const result = await checkLock(tmpDir)
  assert.equal(result.catalogRef, 'main')
  assert.equal(result.count, 3)
})

// ---- readLockSummary ---------------------------------------------------------

test('readLockSummary: missing lock file returns count:0, catalogRef:null', async () => {
  const result = await readLockSummary(tmpDir)
  assert.deepEqual(result, { count: 0, catalogRef: null })
})

test('readLockSummary: does not hash any file content (cheap by design)', async () => {
  // A hash mismatch here would fail checkLock() but must not affect readLockSummary(),
  // which only reads the lockfile's own JSON — never the installed files it references.
  writeLock([
    { id: 'skill.a', type: 'skill', catalogRef: 'v1.0.0', hash: 'sha256-wrong', paths: ['nope.md'] },
  ])
  const result = await readLockSummary(tmpDir)
  assert.deepEqual(result, { count: 1, catalogRef: 'v1.0.0' })
})

test('readLockSummary: falls back to a later item when the first has no catalogRef', async () => {
  // An older/mixed lock could have catalogRef missing on item 0 while later items carry
  // it — must not report catalogRef:null just because the first entry lacks it.
  writeLock([
    { id: 'skill.a', type: 'skill' },
    { id: 'skill.b', type: 'skill', catalogRef: 'v2.0.0' },
  ])
  const result = await readLockSummary(tmpDir)
  assert.deepEqual(result, { count: 2, catalogRef: 'v2.0.0' })
})

test('readLockSummary: catalogRef is null when no item has one', async () => {
  writeLock([{ id: 'skill.a', type: 'skill' }])
  const result = await readLockSummary(tmpDir)
  assert.deepEqual(result, { count: 1, catalogRef: null })
})

test('checkLock: detects hash drift when installed files changed', async () => {
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, '.claude', 'tracked.md'), 'original', 'utf8')
  writeLock([
    {
      id: 'skill.foo',
      type: 'skill',
      version: '1.0.0',
      paths: ['.claude/tracked.md'],
      hash: 'sha256-stale',
    },
  ])

  const result = await checkLock(tmpDir)
  assert.equal(result.ok, false)
  assert.equal(result.driftCount, 1)
  assert.equal(result.drift[0].id, 'skill.foo')
  assert.equal(result.drift[0].expected, 'sha256-stale')
  assert.ok(result.drift[0].actual.startsWith('sha256-'))
})

test('checkLock: matching hash returns ok:true with empty drift', async () => {
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, '.claude', 'tracked.md'), 'same content', 'utf8')
  writeLock([{ id: 'skill.foo', type: 'skill', paths: ['.claude/tracked.md'] }])
  const { after } = await applyLock(tmpDir)
  const hash = JSON.parse(after)[0].hash

  writeLock([
    {
      id: 'skill.foo',
      type: 'skill',
      version: '1.0.0',
      paths: ['.claude/tracked.md'],
      hash,
    },
  ])

  const result = await checkLock(tmpDir)
  assert.equal(result.ok, true)
  assert.equal(result.driftCount, 0)
})

test('applyLock: empty lockfile writes empty array and returns correct before/after', async () => {
  writeLock([])
  const { before, after } = await applyLock(tmpDir)
  assert.equal(before.trim(), '[]')
  assert.ok(after.includes('[]'))
})

test('applyLock: item with paths that exist gets hash set in output', async () => {
  // Create a tracked file
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, '.claude', 'tracked.md'), 'tracked content', 'utf8')

  writeLock([{ id: 'skill.foo', type: 'skill', paths: ['.claude/tracked.md'] }])

  const { after } = await applyLock(tmpDir)
  const parsed = JSON.parse(after)
  assert.equal(parsed.length, 1)
  assert.ok(parsed[0].hash, 'hash should be set')
  assert.ok(parsed[0].hash.startsWith('sha256-'), 'hash should be a sha256- prefixed string')
})

test('applyLock: item with empty paths gets EMPTY_LOCK_PATHS_TOKEN hash', async () => {
  writeLock([{ id: 'skill.bar', type: 'skill', paths: [] }])

  const { after } = await applyLock(tmpDir)
  const parsed = JSON.parse(after)
  assert.equal(parsed[0].hash, hashText(EMPTY_LOCK_PATHS_TOKEN))
})

test('applyLock: creates backup in .haus-workflow/backups/', async () => {
  writeLock([{ id: 'skill.baz', type: 'skill' }])

  await applyLock(tmpDir)

  const backupDir = path.join(tmpDir, '.haus-workflow', 'backups')
  assert.ok(fs.existsSync(backupDir), 'backups directory should be created')
  const backupFiles = fs.readdirSync(backupDir)
  assert.equal(backupFiles.length, 1, 'one backup file should be created')
  assert.ok(backupFiles[0].startsWith('haus.lock.'), 'backup file should match expected prefix')
  assert.ok(backupFiles[0].endsWith('.json'), 'backup file should be a json file')
})

// ---- diffLock ---------------------------------------------------------------

test('diffLock: identical strings returns "No lockfile changes."', () => {
  const content = JSON.stringify([{ id: 'skill.foo' }], null, 2) + '\n'
  assert.equal(diffLock(content, content), 'No lockfile changes.')
})

test('diffLock: different strings returns a string with diff markers', () => {
  const before = JSON.stringify([{ id: 'skill.old' }], null, 2) + '\n'
  const after = JSON.stringify([{ id: 'skill.new' }], null, 2) + '\n'
  const diff = diffLock(before, after)
  assert.notEqual(diff, 'No lockfile changes.')
  assert.ok(typeof diff === 'string' && diff.length > 0)
  // unified diff includes + or - markers
  assert.ok(diff.includes('+') || diff.includes('-'))
})

// ---- hasLocalOverrides ------------------------------------------------------

test('hasLocalOverrides: returns true when .claude/settings.json exists', async () => {
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.json'), '{}', 'utf8')
  const result = await hasLocalOverrides(tmpDir)
  assert.equal(result, true)
})

test('hasLocalOverrides: returns false when .claude/settings.json is missing', async () => {
  const result = await hasLocalOverrides(tmpDir)
  assert.equal(result, false)
})

test('applyLock: preserves curated provenance fields through re-hash', async () => {
  fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'curated'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'curated', 'SKILL.md'), '# skill', 'utf8')
  writeLock([
    {
      id: 'haus.curated-skill',
      type: 'skill',
      source: 'curated',
      version: '1.0.0',
      catalogRef: 'v9.9.9',
      paths: ['.claude/skills/curated/SKILL.md'],
      hash: 'sha256-stale',
      installMode: 'copied',
      originSourceId: 'ecc-affaanm',
      useMode: 'copy',
      license: 'MIT',
      riskLevel: 'low',
      reviewStatus: 'approved',
    },
  ])

  const { after } = await applyLock(tmpDir)
  const parsed = JSON.parse(after)[0]
  assert.equal(parsed.originSourceId, 'ecc-affaanm')
  assert.equal(parsed.useMode, 'copy')
  assert.equal(parsed.license, 'MIT')
  assert.equal(parsed.riskLevel, 'low')
  assert.equal(parsed.reviewStatus, 'approved')
  assert.equal(parsed.catalogRef, 'v9.9.9')
  assert.ok(parsed.hash.startsWith('sha256-'))
})
