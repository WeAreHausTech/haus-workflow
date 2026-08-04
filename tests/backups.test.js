import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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

async function withCapturedWarnings(fn) {
  const original = console.warn
  const messages = []
  console.warn = (...args) => messages.push(args.map(String).join(' '))
  try {
    await fn()
  } finally {
    console.warn = original
  }
  return messages
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
  const prevExit = process.exitCode
  try {
    await runBackups('restore', { id: 'nope', yes: true, root: temp })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
  }
})

test('runBackups prune refuses with no bound given', async () => {
  const temp = makeTemp('haus-backups-prune-nobound-')
  makeLockBackup(temp, 1000000)
  const prevExit = process.exitCode
  try {
    await runBackups('prune', { yes: true, root: temp })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
  }
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

test('listBackups excludes a top-level symlink and type-mismatched entries, even when named like a valid backup', async () => {
  const temp = makeTemp('haus-backups-toplevel-symlink-')
  const backupsDir = path.join(temp, '.haus-workflow/backups')
  mkdirSync(backupsDir, { recursive: true })

  makeLockBackup(temp, 1000000)

  const secretDir = makeTemp('haus-backups-secret2-')
  writeFileSync(path.join(secretDir, 'secret.txt'), 'top secret')
  symlinkSync(secretDir, path.join(backupsDir, 'undo-2026-03-01T00-00-00-000Z'), 'dir')

  writeFileSync(path.join(backupsDir, 'undo-2026-04-01T00-00-00-000Z'), 'a file, not a directory')
  mkdirSync(path.join(backupsDir, 'haus.lock.9999999.json'), { recursive: true })

  const entries = await listBackups(temp)
  assert.deepEqual(entries.map((e) => e.id), ['haus.lock.1000000.json'])
})

test('restore warns based on each backed-up file\'s own mtime, not the backup directory\'s mtime', async () => {
  const temp = makeTemp('haus-backups-stale-mtime-')
  const backupDir = path.join(temp, '.haus-workflow/backups/undo-2026-01-01T00-00-00-000Z')
  const backupFile = path.join(backupDir, '.claude/rules/haus.md')
  mkdirSync(path.dirname(backupFile), { recursive: true })
  writeFileSync(backupFile, 'old backup content')
  utimesSync(backupFile, 1000, 1000) // file itself: very old
  utimesSync(backupDir, 9000000, 9000000) // directory: deliberately much newer than its own file

  const targetFile = path.join(temp, '.claude/rules/haus.md')
  mkdirSync(path.dirname(targetFile), { recursive: true })
  writeFileSync(targetFile, 'current content')
  utimesSync(targetFile, 5000000, 5000000) // between the file's mtime and the directory's

  const messages = await withCapturedWarnings(() =>
    runBackups('restore', { id: 'undo-2026-01-01T00-00-00-000Z', yes: true, root: temp }),
  )

  const warning = messages.find((m) => m.includes('newer than backup') && m.includes('haus.md'))
  assert.ok(warning, `expected a staleness warning naming haus.md; got: ${JSON.stringify(messages)}`)
  assert.ok(
    warning.includes(new Date(5000000000).toISOString()) &&
      warning.includes(new Date(1000000).toISOString()),
    `expected the warning to name both the destination's and the backup's own ISO timestamps (comparing against the file's own mtime, not the directory's); got: ${warning}`,
  )
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

test('restore skips a FIFO inside a backup dir instead of handing it to fs.copy', async () => {
  const temp = makeTemp('haus-backups-restore-fifo-')
  const backupDir = path.join(temp, '.haus-workflow/backups/undo-2026-01-01T00-00-00-000Z')
  mkdirSync(backupDir, { recursive: true })
  writeFileSync(path.join(backupDir, 'real-file.txt'), 'legit backed-up content')
  const fifoPath = path.join(backupDir, 'a-fifo')
  try {
    execFileSync('mkfifo', [fifoPath])
  } catch {
    return // mkfifo unavailable on this platform — nothing to assert
  }
  const mtimeSeconds = 2000000
  utimesSync(path.join(backupDir, 'real-file.txt'), mtimeSeconds, mtimeSeconds)
  utimesSync(backupDir, mtimeSeconds, mtimeSeconds)

  const messages = await withCapturedWarnings(() =>
    runBackups('restore', { id: 'undo-2026-01-01T00-00-00-000Z', yes: true, root: temp }),
  )

  assert.equal(
    fs.readFileSync(path.join(temp, 'real-file.txt'), 'utf8'),
    'legit backed-up content',
    'real backed-up files still restore normally',
  )
  assert.equal(fs.existsSync(path.join(temp, 'a-fifo')), false, 'the FIFO must never be restored')
  assert.ok(
    messages.some((m) => m.includes('non-regular file') && m.includes('a-fifo')),
    `expected a warning naming the skipped FIFO; got: ${JSON.stringify(messages)}`,
  )
})

test('restore refuses to write through a symlinked lockfile destination', async () => {
  const temp = makeTemp('haus-backups-restore-lock-symlink-')
  makeLockBackup(temp, 1000000)
  mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  const secretDir = makeTemp('haus-backups-secret-lock-')
  const secretFile = path.join(secretDir, 'secret-lock.json')
  writeFileSync(secretFile, 'original secret content')
  symlinkSync(secretFile, path.join(temp, '.haus-workflow/haus.lock.json'))

  const prevExit = process.exitCode
  try {
    await runBackups('restore', { id: 'haus.lock.1000000.json', yes: true, root: temp })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
  }

  assert.equal(
    fs.readFileSync(secretFile, 'utf8'),
    'original secret content',
    'the symlink target must never be overwritten',
  )
})

test('restore skips a target whose destination path is a symlink, but restores the rest', async () => {
  const temp = makeTemp('haus-backups-restore-dest-symlink-')
  makeDirBackup(
    temp,
    'undo-2026-05-01T00-00-00-000Z',
    {
      '.claude/rules/haus.md': 'legit rules content',
      '.claude/rules/other.md': 'other legit content',
    },
    2000000,
  )

  const secretDir = makeTemp('haus-backups-secret-dest-')
  const secretFile = path.join(secretDir, 'secret.md')
  writeFileSync(secretFile, 'original secret content')
  mkdirSync(path.join(temp, '.claude/rules'), { recursive: true })
  symlinkSync(secretFile, path.join(temp, '.claude/rules/haus.md'))

  const messages = await withCapturedWarnings(() =>
    runBackups('restore', { id: 'undo-2026-05-01T00-00-00-000Z', yes: true, root: temp }),
  )

  assert.equal(
    fs.readFileSync(secretFile, 'utf8'),
    'original secret content',
    'the symlinked destination must never be written through',
  )
  assert.equal(
    fs.readFileSync(path.join(temp, '.claude/rules/other.md'), 'utf8'),
    'other legit content',
    'files whose destination is not a symlink still restore normally',
  )
  assert.ok(
    messages.some((m) => m.includes('restore target') && m.includes('haus.md')),
    `expected a warning naming the skipped symlinked target; got: ${JSON.stringify(messages)}`,
  )
})

test('restore skips a target whose ancestor directory is a symlink', async () => {
  const temp = makeTemp('haus-backups-restore-ancestor-symlink-')
  makeDirBackup(
    temp,
    'undo-2026-06-01T00-00-00-000Z',
    { '.claude/rules/haus.md': 'legit content' },
    2000000,
  )

  const secretDir = makeTemp('haus-backups-secret-ancestor-')
  symlinkSync(secretDir, path.join(temp, '.claude'), 'dir')

  const prevExit = process.exitCode
  const messages = await withCapturedWarnings(() =>
    runBackups('restore', { id: 'undo-2026-06-01T00-00-00-000Z', yes: true, root: temp }),
  )
  process.exitCode = prevExit

  assert.equal(
    fs.existsSync(path.join(secretDir, 'rules')),
    false,
    'must never write through the symlinked ancestor directory',
  )
  assert.ok(
    messages.some((m) => m.includes('restore target') && m.includes('haus.md')),
    `expected a warning naming the skipped target under the symlinked ancestor; got: ${JSON.stringify(messages)}`,
  )
})

test('runBackups prune rejects a negative --keep instead of wiping everything', async () => {
  const temp = makeTemp('haus-backups-prune-negkeep-')
  makeLockBackup(temp, 1000000)
  makeLockBackup(temp, 2000000)

  const prevExit = process.exitCode
  try {
    await runBackups('prune', { keep: -1, yes: true, root: temp })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
  }
  const entries = await listBackups(temp)
  assert.equal(entries.length, 2, 'a negative --keep must not delete anything')
})

test('runBackups prune rejects a non-numeric --older-than instead of silently no-op-ing', async () => {
  const temp = makeTemp('haus-backups-prune-nan-')
  makeLockBackup(temp, 1000000)

  const prevExit = process.exitCode
  try {
    await runBackups('prune', { olderThan: 'not-a-number', yes: true, root: temp })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = prevExit
  }
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
