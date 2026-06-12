import test from 'node:test'
import assert from 'node:assert/strict'

import { mapWithConcurrency } from '../src/utils/fs.ts'

// Bounded fan-out guard for mapWithConcurrency, the helper render.ts uses to batch
// content-blob reads. An unbounded Promise.all opens one descriptor per file at once and
// can hit EMFILE on low fd ulimits; mapWithConcurrency caps in-flight work instead.

test('mapWithConcurrency preserves order and caps in-flight work', async () => {
  let inFlight = 0
  let peak = 0
  const items = Array.from({ length: 100 }, (_, i) => i)
  const out = await mapWithConcurrency(
    items,
    async (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      return n * 2
    },
    10,
  )
  assert.deepEqual(out, items.map((n) => n * 2), 'order preserved')
  assert.ok(peak <= 10, `peak concurrency ${peak} must not exceed bound 10`)
})
