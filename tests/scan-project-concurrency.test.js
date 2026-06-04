import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanProject } from '../src/scanner/scan-project.ts'
import { mapWithConcurrency } from '../src/utils/fs.ts'

// Regression guard for the scanner's file-read fan-out. The hash pass over `safeFiles`
// used an unbounded `Promise.all`, opening one descriptor per file simultaneously — on a
// low fd ulimit that throws EMFILE. With many files the read must now run in bounded
// batches (mapWithConcurrency). We can't force EMFILE deterministically across CI hosts,
// so we assert the behavioral outcome the bound guarantees: a large repo scans cleanly
// and every safe file is hashed. On the unbounded version under a low ulimit this throws.

test('scanProject hashes many files without throwing (bounded reads)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-scan-concurrency-'))
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'big-repo' }))
    const COUNT = 250
    const dir = path.join(tmp, 'src')
    fs.mkdirSync(dir)
    for (let i = 0; i < COUNT; i += 1) {
      fs.writeFileSync(path.join(dir, `type-${i}.graphql`), `type T${i} { id: ID! }\n`)
    }

    const result = await scanProject(tmp, 'fast')

    const hashedGraphql = Object.keys(result.scanHashes).filter((f) => f.endsWith('.graphql'))
    assert.equal(hashedGraphql.length, COUNT, 'every .graphql file should be hashed')
    for (const h of Object.values(result.scanHashes)) {
      assert.match(h, /^sha256-[0-9a-f]{64}$/)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

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
