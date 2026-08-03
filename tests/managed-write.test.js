import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  chmodSync,
} from 'node:fs'

import { writeManagedText, writeManagedJson } from '../src/claude/managed-write.js'

// Direct unit coverage for the shared diff-first managed-file writer (audit CLI
// §7: previously only exercised transitively through CLAUDE.md/lockfile/generated-
// primitives writers). This is the common path nearly every managed file goes
// through, so a bug here silently affects all of them at once.

async function withCapturedLog(fn) {
  const lines = []
  const orig = console.log
  console.log = (...args) => {
    lines.push(args.join(' '))
  }
  try {
    return await fn(lines)
  } finally {
    console.log = orig
  }
}

test('writeManagedText creates a new file when none exists', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'hello\n', false)
  assert.equal(existsSync(file), true)
  assert.equal(readFileSync(file, 'utf8'), 'hello\n')
})

test('writeManagedText overwrites when content changed', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'v1\n', false)
  await writeManagedText(dir, file, 'v2\n', false)
  assert.equal(readFileSync(file, 'utf8'), 'v2\n')
})

test('writeManagedText does not log an "Overwriting" line when content is unchanged (non-dry-run)', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'same\n', false)
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'same\n', false)
    assert.equal(readFileSync(file, 'utf8'), 'same\n', 'content stays correct')
    assert.ok(
      !lines.some((l) => l.includes('Overwriting')),
      'no-op write must not log an Overwriting line',
    )
  })
})

test('writeManagedText does not rewrite the file (mtime unchanged) on a no-op write', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'same\n', false)
  const before = statSync(file).mtimeMs
  await new Promise((r) => setTimeout(r, 20))
  await writeManagedText(dir, file, 'same\n', false)
  assert.equal(statSync(file).mtimeMs, before, 'no-op write must not touch the file on disk')
})

test('writeManagedText makes no write syscall at all on a no-op (file made read-only)', async (t) => {
  // A stronger, mtime-granularity-independent proof than the test above: if
  // writeText were ever called on a no-op, this would throw EACCES/EPERM.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'same\n', false)
  chmodSync(file, 0o444)
  // rmSync's t.after (registered above, runs first — node:test hooks run in
  // registration order) removes this fine even read-only; no need to chmod back.
  await assert.doesNotReject(
    writeManagedText(dir, file, 'same\n', false),
    'a no-op write must never attempt to write the file, read-only or not',
  )
})

test('writeManagedText dry-run never touches disk, even for a new file', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'hello\n', true)
    assert.equal(existsSync(file), false, 'dry-run must not create the file')
    assert.ok(lines.some((l) => l.includes(path.basename(file))), 'dry-run logs the file path')
  })
})

test('writeManagedText dry-run does not modify an existing changed file', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  writeFileSync(file, 'old\n', 'utf8')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'new\n', true)
    assert.equal(readFileSync(file, 'utf8'), 'old\n', 'dry-run must not write')
    assert.ok(lines.length > 0, 'dry-run logs a diff for a changed file')
  })
})

test('writeManagedText dry-run reports unchanged when content matches', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.txt')
  writeFileSync(file, 'same\n', 'utf8')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'same\n', true)
    assert.ok(lines.some((l) => l.includes('unchanged')), 'dry-run reports unchanged content')
  })
})

test('writeManagedJson serializes and writes pretty-printed JSON', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.json')
  await writeManagedJson(dir, file, { a: 1, b: [1, 2] }, false)
  const written = readFileSync(file, 'utf8')
  assert.deepEqual(JSON.parse(written), { a: 1, b: [1, 2] })
  assert.match(written, /\n$/, 'trailing newline')
  assert.match(written, /^\{\n {2}"a": 1,\n/, 'pretty-printed with a real 2-space indent')
})

test('writeManagedJson dry-run does not write to disk', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.json')
  await writeManagedJson(dir, file, { a: 1 }, true)
  assert.equal(existsSync(file), false)
})
