import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { unrecognisableItems, isItemRecognisable } from '../src/scanner/derive-from-manifest.ts'

/**
 * Anti-drift coverage: every catalog item shipped in the bundled manifest must be
 * recognisable by the scanner (via a dependency/packageNamePattern clause, a known role,
 * or a registry-producible stack). If the catalog adds an item the scanner could never
 * detect, this fails — forcing a registry rule or a dependency-backed clause.
 */
test('every bundled-manifest item is recognisable by the detection registry', () => {
  const manifest = JSON.parse(fs.readFileSync('library/catalog/manifest.json', 'utf8'))
  const orphans = unrecognisableItems(manifest.items)
  assert.deepEqual(
    orphans.map((i) => i.id),
    [],
    'these catalog items have no clause the scanner can satisfy — add a registry rule or a dependency clause',
  )
})

test('isItemRecognisable rejects an item whose only clause is an unknown stack', () => {
  assert.equal(isItemRecognisable({ requiresAny: [{ stack: 'totally-unknown' }] }), false)
  assert.equal(isItemRecognisable({ requiresAny: [{ dependency: 'anything' }] }), true)
  assert.equal(isItemRecognisable({ requiresAny: [] }), true)
})
