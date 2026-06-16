import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseManifest } from '../src/catalog/manifest-schema.js'

test('strips __proto__/constructor keys without rejecting manifest', () => {
  const json =
    '{"version":"1.0.0","items":[{"id":"x","type":"skill","path":"skills/x","tags":[],"repoRoles":[],"tokenEstimate":1,"__proto__":{"polluted":true}}]}'
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
        tags: [],
        repoRoles: [],
        tokenEstimate: 1,
      },
    ],
  })
  const result = parseManifest(json)
  assert.equal(result.ok, false)
  assert.match(result.error, /reviewStatus/)
})

test('rejects duplicate item ids and paths', () => {
  const dupId = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        { id: 'a', type: 'skill', path: 'skills/a', tags: [], repoRoles: [], tokenEstimate: 1 },
        { id: 'a', type: 'skill', path: 'skills/b', tags: [], repoRoles: [], tokenEstimate: 1 },
      ],
    }),
  )
  assert.equal(dupId.ok, false)
  assert.match(dupId.error, /duplicate id/)

  const dupPath = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        { id: 'a', type: 'skill', path: 'skills/shared', tags: [], repoRoles: [], tokenEstimate: 1 },
        { id: 'b', type: 'skill', path: 'skills/shared', tags: [], repoRoles: [], tokenEstimate: 1 },
      ],
    }),
  )
  assert.equal(dupPath.ok, false)
  assert.match(dupPath.error, /duplicate path/)
})

test('accepts a valid manifest and exposes version', () => {
  const json = JSON.stringify({
    version: '2.1.0',
    items: [
      {
        id: 'a',
        type: 'skill',
        path: 'skills/a',
        tags: [],
        repoRoles: [],
        tokenEstimate: 100,
      },
    ],
  })
  const result = parseManifest(json)
  assert.equal(result.ok, true)
  assert.equal(result.manifest.version, '2.1.0')
})

test('rejects manifest when item tags or repoRoles are not arrays', () => {
  const badTags = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        {
          id: 'a',
          type: 'skill',
          path: 'skills/a',
          tags: 'nextjs',
          repoRoles: [],
          tokenEstimate: 1,
        },
      ],
    }),
  )
  assert.equal(badTags.ok, false)
  assert.match(badTags.error, /tags must be a string array/)

  const badRoles = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        {
          id: 'b',
          type: 'skill',
          path: 'skills/b',
          tags: [],
          repoRoles: null,
          tokenEstimate: 1,
        },
      ],
    }),
  )
  assert.equal(badRoles.ok, false)
  assert.match(badRoles.error, /repoRoles must be a string array/)
})

test('rejects manifest when requiresAny is malformed', () => {
  const badShape = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        {
          id: 'a',
          type: 'skill',
          path: 'skills/a',
          tags: [],
          repoRoles: [],
          tokenEstimate: 1,
          requiresAny: 'nextjs',
        },
      ],
    }),
  )
  assert.equal(badShape.ok, false)
  assert.match(badShape.error, /requiresAny/)

  const badClause = parseManifest(
    JSON.stringify({
      version: '1.0.0',
      items: [
        {
          id: 'b',
          type: 'skill',
          path: 'skills/b',
          tags: [],
          repoRoles: [],
          tokenEstimate: 1,
          requiresAny: [{ stack: 'nextjs', role: 'next-app' }],
        },
      ],
    }),
  )
  assert.equal(badClause.ok, false)
  assert.match(badClause.error, /requiresAny/)
})
