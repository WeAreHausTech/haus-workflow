import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { hashInstalledPaths, EMPTY_LOCK_PATHS_TOKEN } from '../src/update/hash-installed.js'
import { hashText } from '../src/utils/fs.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-hash-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// empty relPaths → deterministic sha256 hash
test('empty relPaths returns deterministic hash', async () => {
  const h1 = await hashInstalledPaths(tmpDir, [])
  const h2 = await hashInstalledPaths(tmpDir, [])
  assert.equal(h1, h2)
  assert.equal(h1, hashText(EMPTY_LOCK_PATHS_TOKEN))
  assert.ok(h1.startsWith('sha256-'))
})

// single file → hash matches calling hashText on its content
test('single file hash matches hashText of its content', async () => {
  const content = 'hello world'
  fs.writeFileSync(path.join(tmpDir, 'file.txt'), content, 'utf8')
  const result = await hashInstalledPaths(tmpDir, ['file.txt'])
  // expected: hash of the single entry "file.txt=<contentHash>"
  const expected = hashText(`file.txt=${hashText(content)}`)
  assert.equal(result, expected)
})

// same file hashed twice → stable (deterministic)
test('hashing same file twice returns identical result', async () => {
  fs.writeFileSync(path.join(tmpDir, 'stable.txt'), 'deterministic content', 'utf8')
  const h1 = await hashInstalledPaths(tmpDir, ['stable.txt'])
  const h2 = await hashInstalledPaths(tmpDir, ['stable.txt'])
  assert.equal(h1, h2)
})

// missing path skipped → does not throw, returns empty-paths hash
test('missing path is skipped without throwing', async () => {
  const result = await hashInstalledPaths(tmpDir, ['nonexistent/path.txt'])
  // all paths exist but are missing → fileDigests is empty → uses EMPTY_LOCK_PATHS_TOKEN|path form
  const expected = hashText(`${EMPTY_LOCK_PATHS_TOKEN}|nonexistent/path.txt`)
  assert.equal(result, expected)
})

// directory expanded → hash includes all files in dir
test('directory path is expanded to include all contained files', async () => {
  const subDir = path.join(tmpDir, 'mydir')
  fs.mkdirSync(subDir)
  fs.writeFileSync(path.join(subDir, 'a.txt'), 'alpha', 'utf8')
  fs.writeFileSync(path.join(subDir, 'b.txt'), 'beta', 'utf8')

  const result = await hashInstalledPaths(tmpDir, ['mydir'])

  // Build expected hash manually: two files in sorted order
  const digestA = hashText('alpha')
  const digestB = hashText('beta')
  const entries = [
    { rel: 'mydir/a.txt', digest: digestA },
    { rel: 'mydir/b.txt', digest: digestB },
  ].sort((a, b) => a.rel.localeCompare(b.rel))
  const expected = hashText(entries.map((e) => `${e.rel}=${e.digest}`).join('|'))
  assert.equal(result, expected)
})

// duplicate paths deduplicated → same result as without duplicate
test('duplicate paths produce the same hash as a single path entry', async () => {
  fs.writeFileSync(path.join(tmpDir, 'dup.txt'), 'duplicate content', 'utf8')
  const withDuplicate = await hashInstalledPaths(tmpDir, ['dup.txt', 'dup.txt'])
  const withoutDuplicate = await hashInstalledPaths(tmpDir, ['dup.txt'])
  assert.equal(withDuplicate, withoutDuplicate)
})

// backslash normalization → 'foo\\bar.md' treated the same as 'foo/bar.md'
test('backslash paths are normalized to forward slashes', async () => {
  const subDir = path.join(tmpDir, 'foo')
  fs.mkdirSync(subDir)
  fs.writeFileSync(path.join(subDir, 'bar.md'), 'content', 'utf8')

  const withForwardSlash = await hashInstalledPaths(tmpDir, ['foo/bar.md'])
  const withBackslash = await hashInstalledPaths(tmpDir, ['foo\\bar.md'])
  assert.equal(withForwardSlash, withBackslash)
})
