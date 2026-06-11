import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { normaliseLF } from '../src/claude/managed-template.js'
import { hashInstalledPaths } from '../src/update/hash-installed.js'
import { hashText } from '../src/utils/fs.js'

test('hashInstalledPaths is CRLF-insensitive (matches write-time normaliseLF hashing)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'haus-crlf-'))
  const body = '# WORKFLOW\nline one\nline two\n'
  const rel = 'WORKFLOW.md'
  await writeFile(path.join(dir, rel), body.replace(/\n/g, '\r\n'), 'utf8')

  const digest = await hashInstalledPaths(dir, [rel])
  const expected = hashText(`${rel}=${hashText(normaliseLF(body))}`)

  assert.equal(digest, expected)
})
