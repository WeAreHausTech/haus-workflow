import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'

import { writeJson, writeText } from '../src/utils/fs.js'

test('writeText writes atomically and leaves no temp files', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-fs-atomic-'))
  const file = path.join(dir, 'a.txt')
  await writeText(file, 'hello')
  await writeText(file, 'hello-2')
  assert.equal(readFileSync(file, 'utf8'), 'hello-2')
  const leftovers = readdirSync(dir).filter((name) => name.startsWith('.tmp-haus-write-'))
  assert.deepEqual(leftovers, [])
})

test('writeJson writes atomically and leaves no temp files', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-fs-atomic-'))
  const file = path.join(dir, 'a.json')
  await writeJson(file, { a: 1 })
  await writeJson(file, { a: 2 })
  assert.match(readFileSync(file, 'utf8'), /"a": 2/)
  const leftovers = readdirSync(dir).filter((name) => name.startsWith('.tmp-haus-write-'))
  assert.deepEqual(leftovers, [])
})
