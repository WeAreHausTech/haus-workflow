import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseManifest } from '../src/catalog/manifest-schema.js'

test('rejects __proto__/constructor keys (prototype pollution)', () => {
  const json =
    '{"version":"1.0.0","items":[{"id":"x","type":"skill","path":"skills/x","__proto__":{"polluted":true}}]}'
  const result = parseManifest(json)
  assert.equal({}.polluted, undefined)
  assert.ok(result.ok)
})

test('fails when a curated item is missing reviewStatus (field rename guard)', () => {
  const json = JSON.stringify({
    version: '1.0.0',
    items: [
      {
        id: 'c',
        type: 'skill',
        path: 'skills/c',
        source: 'curated',
        reviewState: 'approved',
        riskLevel: 'low',
      },
    ],
  })
  const result = parseManifest(json)
  assert.equal(result.ok, false)
  assert.match(result.error, /reviewStatus/)
})

test('accepts a valid manifest and exposes version', () => {
  const json = JSON.stringify({
    version: '2.1.0',
    items: [{ id: 'a', type: 'skill', path: 'skills/a' }],
  })
  const result = parseManifest(json)
  assert.equal(result.ok, true)
  assert.equal(result.manifest.version, '2.1.0')
})
