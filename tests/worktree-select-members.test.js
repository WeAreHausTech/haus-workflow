// tests/worktree-select-members.test.js
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { selectMembers } from '../src/workspace/worktree/select-members.ts'

const MEMBERS = [
  { id: 'storefront', folder: 'apps/storefront', absPath: '/ws/apps/storefront', source: 'haus.workspace.yaml' },
  { id: 'cms', folder: 'cms', absPath: '/ws/cms', source: 'haus.workspace.yaml' },
]

describe('selectMembers', () => {
  test('no --only: returns every member, no unknowns', () => {
    const { selected, unknown } = selectMembers(MEMBERS)
    assert.deepEqual(selected, MEMBERS)
    assert.deepEqual(unknown, [])
  })

  test('filters by id', () => {
    const { selected, unknown } = selectMembers(MEMBERS, ['cms'])
    assert.deepEqual(selected.map((m) => m.id), ['cms'])
    assert.deepEqual(unknown, [])
  })

  test('filters by folder', () => {
    const { selected, unknown } = selectMembers(MEMBERS, ['apps/storefront'])
    assert.deepEqual(selected.map((m) => m.id), ['storefront'])
    assert.deepEqual(unknown, [])
  })

  test('unknown name is reported, not silently dropped', () => {
    const { selected, unknown } = selectMembers(MEMBERS, ['cms', 'does-not-exist'])
    assert.deepEqual(selected.map((m) => m.id), ['cms'])
    assert.deepEqual(unknown, ['does-not-exist'])
  })
})
