import { test } from 'node:test'
import assert from 'node:assert/strict'

import { targetDirForType } from '../src/claude/write-claude-files.js'

test('unknown type does not misfile to skills', () => {
  assert.equal(targetDirForType('hook'), null)
})

test('known types map correctly', () => {
  assert.equal(targetDirForType('agent'), 'agents')
  assert.equal(targetDirForType('command'), 'commands')
  assert.equal(targetDirForType('skill'), 'skills')
})
