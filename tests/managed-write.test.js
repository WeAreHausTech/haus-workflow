import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

import { writeManagedText, writeManagedJson } from '../src/claude/managed-write.js'

// Direct unit coverage for the shared diff-first managed-file writer (audit CLI
// §7: previously only exercised transitively through CLAUDE.md/lockfile/generated-
// primitives writers). This is the common path nearly every managed file goes
// through, so a bug here silently affects all of them at once.

function withCapturedLog(fn) {
  const lines = []
  const orig = console.log
  console.log = (...args) => {
    lines.push(args.join(' '))
  }
  return fn(lines).finally(() => {
    console.log = orig
  })
}

test('writeManagedText creates a new file when none exists', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'hello\n', false)
  assert.equal(existsSync(file), true)
  assert.equal(readFileSync(file, 'utf8'), 'hello\n')
})

test('writeManagedText overwrites when content changed', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.txt')
  await writeManagedText(dir, file, 'v1\n', false)
  await writeManagedText(dir, file, 'v2\n', false)
  assert.equal(readFileSync(file, 'utf8'), 'v2\n')
})

test('writeManagedText does not log an "Overwriting" line when content is unchanged (non-dry-run)', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
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

test('writeManagedText dry-run never touches disk, even for a new file', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.txt')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'hello\n', true)
    assert.equal(existsSync(file), false, 'dry-run must not create the file')
    assert.ok(lines.some((l) => l.includes(path.basename(file))), 'dry-run logs the file path')
  })
})

test('writeManagedText dry-run does not modify an existing changed file', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.txt')
  writeFileSync(file, 'old\n', 'utf8')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'new\n', true)
    assert.equal(readFileSync(file, 'utf8'), 'old\n', 'dry-run must not write')
    assert.ok(lines.length > 0, 'dry-run logs a diff for a changed file')
  })
})

test('writeManagedText dry-run reports unchanged when content matches', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.txt')
  writeFileSync(file, 'same\n', 'utf8')
  await withCapturedLog(async (lines) => {
    await writeManagedText(dir, file, 'same\n', true)
    assert.ok(lines.some((l) => l.includes('unchanged')), 'dry-run reports unchanged content')
  })
})

test('writeManagedJson serializes and writes pretty-printed JSON', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.json')
  await writeManagedJson(dir, file, { a: 1, b: [1, 2] }, false)
  const written = readFileSync(file, 'utf8')
  assert.deepEqual(JSON.parse(written), { a: 1, b: [1, 2] })
  assert.match(written, /\n$/, 'trailing newline')
  assert.match(written, /"a": 1/, 'pretty-printed with 2-space indent')
})

test('writeManagedJson dry-run does not write to disk', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-managed-write-'))
  const file = path.join(dir, 'a.json')
  await writeManagedJson(dir, file, { a: 1 }, true)
  assert.equal(existsSync(file), false)
})
