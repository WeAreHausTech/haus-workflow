import { test } from 'node:test'
import assert from 'node:assert/strict'

import { estimateContextTokens, tokenReductionPct } from '../src/recommender/token-estimate.js'

test('estimateContextTokens', () => {
  assert.equal(estimateContextTokens(2), 640)
})

test('tokenReductionPct never negative', () => {
  assert.equal(tokenReductionPct(5, 0), 0)
  assert.ok(tokenReductionPct(2, 8) > 0)
})
