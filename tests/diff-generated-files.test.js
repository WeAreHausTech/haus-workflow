import test from 'node:test'
import assert from 'node:assert/strict'

import { diffGeneratedFiles, summarizeLockDiff } from '../src/update/diff-generated-files.js'

test('diffGeneratedFiles returns advisory summary', () => {
  const msg = diffGeneratedFiles()
  assert.match(msg, /Generated files may change/)
  assert.match(msg, /\.claude\/\*/)
})

test('summarizeLockDiff reports no textual changes when equal', () => {
  const lock = JSON.stringify([{ id: 'a' }], null, 2)
  assert.equal(summarizeLockDiff(lock, lock), 'No lockfile textual changes.')
})

test('summarizeLockDiff reports added and removed item counts', () => {
  const before = JSON.stringify([{ id: 'a' }, { id: 'b' }], null, 2)
  const after = JSON.stringify([{ id: 'b' }, { id: 'c' }], null, 2)
  const summary = summarizeLockDiff(before, after)
  assert.match(summary, /Lock item changes: \+1 -1/)
})

test('summarizeLockDiff falls back to text diff when JSON parse fails', () => {
  const summary = summarizeLockDiff('not-json', 'still-not-json')
  assert.match(summary, /Lock item changes unavailable/)
})
