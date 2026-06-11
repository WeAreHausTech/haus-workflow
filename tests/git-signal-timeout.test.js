import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readChangedFiles } from '../src/recommender/git-signal.js'

test('readChangedFiles returns [] when git hangs/errors (no signal, no throw)', async () => {
  const result = await readChangedFiles('/nonexistent-path-xyz')
  assert.deepEqual(result, [])
})
