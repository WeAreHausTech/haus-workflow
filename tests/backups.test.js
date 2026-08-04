import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs'
import { execaSync } from 'execa'

import { listBackups, runBackups } from '../src/commands/backups.js'

function makeTemp(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

function makeLockBackup(root, epochMs) {
  const dir = path.join(root, '.haus-workflow/backups')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `haus.lock.${epochMs}.json`)
  writeFileSync(file, `[{"id":"snapshot-${epochMs}"}]`)
  const seconds = epochMs / 1000
  utimesSync(file, seconds, seconds)
  return file
}

function makeDirBackup(root, name, relFiles, mtimeSeconds) {
  const backupDir = path.join(root, '.haus-workflow/backups', name)
  for (const [rel, content] of Object.entries(relFiles)) {
    const abs = path.join(backupDir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    utimesSync(abs, mtimeSeconds, mtimeSeconds)
  }
  utimesSync(backupDir, mtimeSeconds, mtimeSeconds)
  return backupDir
}

test('listBackups classifies lock, undo, and prune entries and ignores unknown ones, oldest first', async () => {
  const temp = makeTemp('haus-backups-list-')
  makeLockBackup(temp, 1000000)
  makeDirBackup(temp, 'undo-2026-01-01T00-00-00-000Z', { '.claude/rules/haus.md': 'x' }, 2000000)
  makeDirBackup(temp, 'prune-2026-02-01T00-00-00-000Z', { '.claude/skills/foo/SKILL.md': 'x' }, 3000000)
  mkdirSync(path.join(temp, '.haus-workflow/backups/not-a-backup'), { recursive: true })

  const entries = await listBackups(temp)
  assert.deepEqual(
    entries.map((e) => e.kind),
    ['lock', 'undo', 'prune'],
  )
  assert.deepEqual(
    entries.map((e) => e.id),
    ['haus.lock.1000000.json', 'undo-2026-01-01T00-00-00-000Z', 'prune-2026-02-01T00-00-00-000Z'],
  )
})

test('listBackups returns an empty array when no backups directory exists', async () => {
  const temp = makeTemp('haus-backups-empty-')
  assert.deepEqual(await listBackups(temp), [])
})

test('runBackups restore for a lock backup overwrites haus.lock.json', async () => {
  const temp = makeTemp('haus-backups-restore-lock-')
  makeLockBackup(temp, 1000000)
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  writeFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), '[]')

  await runBackups('restore', { id: 'haus.lock.1000000.json', yes: true, root: temp })

  const restored = fs.readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8')
  assert.equal(restored, '[{"id":"snapshot-1000000"}]')
})

test('runBackups restore for a dir backup copies files back to their original relative paths', async () => {
  const temp = makeTemp('haus-backups-restore-dir-')
  makeDirBackup(
    temp,
    'undo-2026-01-01T00-00-00-000Z',
    { '.claude/rules/haus.md': 'original content' },
    2000000,
  )

  await runBackups('restore', { id: 'undo-2026-01-01T00-00-00-000Z', yes: true, root: temp })

  const restored = fs.readFileSync(path.join(temp, '.claude/rules/haus.md'), 'utf8')
  assert.equal(restored, 'original content')
})

test('runBackups restore fails cleanly for an unknown id', async () => {
  const temp = makeTemp('haus-backups-restore-missing-')
  await runBackups('restore', { id: 'nope', yes: true, root: temp })
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('runBackups prune refuses with no bound given', async () => {
  const temp = makeTemp('haus-backups-prune-nobound-')
  makeLockBackup(temp, 1000000)
  await runBackups('prune', { yes: true, root: temp })
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
  const entries = await listBackups(temp)
  assert.equal(entries.length, 1, 'nothing should be removed without a bound')
})

test('runBackups prune --keep removes the oldest entries beyond the keep count', async () => {
  const temp = makeTemp('haus-backups-prune-keep-')
  makeLockBackup(temp, 1000000)
  makeLockBackup(temp, 2000000)
  makeLockBackup(temp, 3000000)

  await runBackups('prune', { keep: 1, yes: true, root: temp })

  const entries = await listBackups(temp)
  assert.deepEqual(entries.map((e) => e.id), ['haus.lock.3000000.json'])
})

test('runBackups prune --older-than removes entries past the age threshold', async () => {
  const temp = makeTemp('haus-backups-prune-age-')
  const oldEpochMs = Date.now() - 40 * 24 * 60 * 60 * 1000
  const recentEpochMs = Date.now() - 1 * 24 * 60 * 60 * 1000
  makeLockBackup(temp, oldEpochMs)
  makeLockBackup(temp, recentEpochMs)

  await runBackups('prune', { olderThan: 30, yes: true, root: temp })

  const entries = await listBackups(temp)
  assert.deepEqual(entries.map((e) => e.id), [`haus.lock.${recentEpochMs}.json`])
})

test('runBackups restore for a prune-kind backup copies files back to their original relative paths', async () => {
  const temp = makeTemp('haus-backups-restore-prune-')
  makeDirBackup(
    temp,
    'prune-2026-02-01T00-00-00-000Z',
    { '.claude/skills/foo/SKILL.md': 'pruned skill content' },
    3000000,
  )

  await runBackups('restore', { id: 'prune-2026-02-01T00-00-00-000Z', yes: true, root: temp })

  const restored = fs.readFileSync(path.join(temp, '.claude/skills/foo/SKILL.md'), 'utf8')
  assert.equal(restored, 'pruned skill content')
})

test('restore never follows a symlink planted inside a backup dir', async () => {
  const temp = makeTemp('haus-backups-restore-symlink-')
  const secretDir = makeTemp('haus-backups-secret-')
  writeFileSync(path.join(secretDir, 'secret.txt'), 'top secret host content')

  const backupDir = path.join(temp, '.haus-workflow/backups/undo-2026-01-01T00-00-00-000Z')
  mkdirSync(backupDir, { recursive: true })
  writeFileSync(path.join(backupDir, 'real-file.txt'), 'legit backed-up content')
  symlinkSync(secretDir, path.join(backupDir, 'linked'), 'dir')
  const mtimeSeconds = 2000000
  utimesSync(path.join(backupDir, 'real-file.txt'), mtimeSeconds, mtimeSeconds)
  utimesSync(backupDir, mtimeSeconds, mtimeSeconds)

  await runBackups('restore', { id: 'undo-2026-01-01T00-00-00-000Z', yes: true, root: temp })

  assert.equal(
    fs.readFileSync(path.join(temp, 'real-file.txt'), 'utf8'),
    'legit backed-up content',
    'real backed-up files still restore normally',
  )
  assert.equal(
    fs.existsSync(path.join(temp, 'linked')),
    false,
    'the symlink must never be followed into the restore destination',
  )
})

test('runBackups prune rejects a negative --keep instead of wiping everything', async () => {
  const temp = makeTemp('haus-backups-prune-negkeep-')
  makeLockBackup(temp, 1000000)
  makeLockBackup(temp, 2000000)

  await runBackups('prune', { keep: -1, yes: true, root: temp })

  assert.equal(process.exitCode, 1)
  process.exitCode = 0
  const entries = await listBackups(temp)
  assert.equal(entries.length, 2, 'a negative --keep must not delete anything')
})

test('runBackups prune rejects a non-numeric --older-than instead of silently no-op-ing', async () => {
  const temp = makeTemp('haus-backups-prune-nan-')
  makeLockBackup(temp, 1000000)

  await runBackups('prune', { olderThan: 'not-a-number', yes: true, root: temp })

  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('CLI: haus backups list / restore / prune wire through commander end-to-end', () => {
  const temp = makeTemp('haus-backups-cli-')
  makeDirBackup(
    temp,
    'undo-2026-01-01T00-00-00-000Z',
    { '.claude/rules/haus.md': 'restored via cli' },
    2000000,
  )
  const cli = path.resolve('dist/cli.js')

  const list = execaSync('node', [cli, 'backups', 'list'], { cwd: temp, reject: false })
  assert.equal(list.exitCode, 0)
  assert.match(list.stdout, /undo-2026-01-01T00-00-00-000Z\s+\[undo\]/)

  const restore = execaSync(
    'node',
    [cli, 'backups', 'restore', 'undo-2026-01-01T00-00-00-000Z', '--yes'],
    { cwd: temp, reject: false },
  )
  assert.equal(restore.exitCode, 0)
  assert.equal(
    fs.readFileSync(path.join(temp, '.claude/rules/haus.md'), 'utf8'),
    'restored via cli',
  )

  const pruneNoBound = execaSync('node', [cli, 'backups', 'prune', '--yes'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(pruneNoBound.exitCode, 1)
  assert.match(pruneNoBound.stderr, /refusing to prune with no bound/)

  const prune = execaSync('node', [cli, 'backups', 'prune', '--keep', '0', '--yes'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(prune.exitCode, 0)
  const remaining = execaSync('node', [cli, 'backups', 'list'], { cwd: temp, reject: false })
  assert.match(remaining.stdout, /No backups found/)
})
