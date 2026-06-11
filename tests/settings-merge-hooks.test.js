import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hausHookContractSatisfied } from '../src/claude/verify-hooks-contract.js'
import { mergeHooks } from '../src/install/settings-merge.js'

const CONTEXT_FRAGMENT = {
  id: 'hook.context',
  gate: 'keep',
  event: 'UserPromptSubmit',
  command: 'haus context --from-hook',
}

const CANONICAL = {
  hooks: {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'haus context --from-hook' }] },
    ],
    PreToolUse: [],
  },
  permissions: { deny: [] },
}

test('re-adds a haus hook the user deleted even when _haus tracking still lists it', () => {
  const settings = {
    _haus: { hooks: ['hook.context'] },
    hooks: { UserPromptSubmit: [] },
  }
  const { settings: merged } = mergeHooks(settings, [CONTEXT_FRAGMENT])
  assert.ok(hausHookContractSatisfied(merged, CANONICAL))
  assert.equal(merged.hooks.UserPromptSubmit.length, 1)
})

test('does not duplicate a hook already present when _haus tracking was cleared', () => {
  const entry = {
    hooks: [{ type: 'command', command: 'haus context --from-hook' }],
  }
  const settings = {
    _haus: { hooks: [] },
    hooks: { UserPromptSubmit: [entry] },
  }
  const { settings: merged } = mergeHooks(settings, [CONTEXT_FRAGMENT])
  assert.equal(merged.hooks.UserPromptSubmit.length, 1)
})
