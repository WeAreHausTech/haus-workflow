import test from 'node:test'
import assert from 'node:assert/strict'

import { parseWorkspaceConfig } from '../src/commands/workspace/config.ts'

test('parseWorkspaceConfig returns undefined for missing or malformed input', () => {
  assert.equal(parseWorkspaceConfig(undefined), undefined)
  assert.equal(parseWorkspaceConfig(''), undefined)
  assert.equal(parseWorkspaceConfig('repos: [ this: is, : broken\n  -\n'), undefined)
  // Non-object YAML (a bare scalar) is not a config.
  assert.equal(parseWorkspaceConfig('42'), undefined)
})

test('parseWorkspaceConfig fills defaults for a sparse config', () => {
  const cfg = parseWorkspaceConfig('repos: []\n')
  assert.deepEqual(cfg, { client: 'unknown', repos: [], relationships: [] })
})

test('parseWorkspaceConfig drops repo entries missing name or path', () => {
  const cfg = parseWorkspaceConfig(
    [
      'client: acme',
      'repos:',
      '  - name: good',
      '    path: a',
      '    role: frontend',
      '  - name: no-path',
      '  - path: no-name',
      '  - not-an-object',
      'relationships:',
      '  - from: good',
      '    to: other',
      '',
    ].join('\n'),
  )
  assert.equal(cfg.client, 'acme')
  assert.deepEqual(
    cfg.repos.map((r) => r.name),
    ['good'],
  )
  assert.deepEqual(cfg.relationships, [{ from: 'good', to: 'other' }])
})
