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

// audit L3: binary content must not be lossily transcoded through UTF-8 before hashing
test('text file hashes identically across LF/CRLF (normalization intact)', async () => {
  const filePath = path.join(tmpDir, 'a.md')
  fs.writeFileSync(filePath, 'line one\nline two\n', 'utf8')
  const hashLF = await hashInstalledPaths(tmpDir, ['a.md'])
  fs.writeFileSync(filePath, 'line one\r\nline two\r\n', 'utf8')
  const hashCRLF = await hashInstalledPaths(tmpDir, ['a.md'])
  assert.equal(hashLF, hashCRLF, 'LF and CRLF text content must hash identically')
})

test('binary content hashes by raw bytes, not lossy UTF-8 text', async () => {
  // Bytes that are invalid as UTF-8 (a lone continuation byte, 0xFF, 0xFE) — decoding
  // and re-encoding these as 'utf8' replaces them with U+FFFD, collapsing distinct
  // inputs to the same lossy text and therefore the same (wrong) hash.
  // Both 0xFF and 0xFE are invalid standalone UTF-8 lead bytes — naive decode+hash
  // collapses both to the same U+FFFD replacement character before the trailing 'A',
  // so a hasher that hashes the lossy text (not the bytes) sees these as identical.
  const binaryA = Buffer.from([0xff, 0x41])
  const binaryB = Buffer.from([0xfe, 0x41])
  const filePath = path.join(tmpDir, 'a.bin')
  fs.writeFileSync(filePath, binaryA)
  const hashA = await hashInstalledPaths(tmpDir, ['a.bin'])
  fs.writeFileSync(filePath, binaryB)
  const hashB = await hashInstalledPaths(tmpDir, ['a.bin'])
  assert.notEqual(hashA, hashB, 'distinct binary content must not collapse to the same hash')
})

test('directory expansion hashes mixed text and binary files without throwing', async () => {
  fs.mkdirSync(path.join(tmpDir, 'skill'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'skill', 'SKILL.md'), '# skill\n', 'utf8')
  fs.writeFileSync(path.join(tmpDir, 'skill', 'asset.bin'), Buffer.from([0xff, 0xfe, 0x00]))
  const hash = await hashInstalledPaths(tmpDir, ['skill'])
  assert.ok(hash.startsWith('sha256-'))
})

test('followSymlinks: false excludes a symlinked top-level path entirely', async () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-hash-outside-'))
  try {
    fs.writeFileSync(path.join(outsideDir, 'SKILL.md'), '# outside\n')
    fs.symlinkSync(outsideDir, path.join(tmpDir, 'symlinked-skill'))

    const withSymlinks = await hashInstalledPaths(tmpDir, ['symlinked-skill'])
    const withoutSymlinks = await hashInstalledPaths(tmpDir, ['symlinked-skill'], {
      followSymlinks: false,
    })
    // Default (unchanged) behavior follows it and hashes the outside content.
    assert.notEqual(withSymlinks, hashText(EMPTY_LOCK_PATHS_TOKEN))
    // followSymlinks: false must treat it as if the path weren't there at all.
    assert.equal(withoutSymlinks, hashText(`${EMPTY_LOCK_PATHS_TOKEN}|symlinked-skill`))
  } finally {
    fs.rmSync(outsideDir, { recursive: true, force: true })
  }
})

test('followSymlinks: false excludes a symlinked file nested inside an otherwise-real directory', async () => {
  const outsideFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'haus-hash-outside-')), 'x.md')
  fs.writeFileSync(outsideFile, '# outside file\n')
  try {
    fs.mkdirSync(path.join(tmpDir, 'skill2'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'skill2', 'SKILL.md'), '# real\n', 'utf8')
    fs.symlinkSync(outsideFile, path.join(tmpDir, 'skill2', 'linked.md'))

    const withSymlinks = await hashInstalledPaths(tmpDir, ['skill2'])
    const withoutSymlinks = await hashInstalledPaths(tmpDir, ['skill2'], { followSymlinks: false })
    // The symlinked nested file changes the default-mode hash...
    assert.notEqual(withSymlinks, withoutSymlinks)
    // ...but excluding it must still hash the real SKILL.md content, not treat the
    // whole directory as empty.
    const realOnly = hashText(`skill2/SKILL.md=${hashText('# real\n')}`)
    assert.equal(withoutSymlinks, realOnly)
  } finally {
    fs.rmSync(path.dirname(outsideFile), { recursive: true, force: true })
  }
})
