import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hausHookContractSatisfied } from '../src/claude/verify-hooks-contract.js'
import { mergeHooks } from '../src/install/settings-merge.js'

const GUARD_FRAGMENT = {
  id: 'hook.guard.file-access',
  gate: 'keep',
  event: 'PreToolUse',
  matcher: 'Read|Edit|Write',
  command: 'haus guard file-access --from-hook',
}

const CANONICAL = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Read|Edit|Write',
        hooks: [{ type: 'command', command: 'haus guard file-access --from-hook' }],
      },
    ],
  },
  permissions: { deny: [] },
}

test('re-adds a haus hook the user deleted even when _haus tracking still lists it', () => {
  const settings = {
    _haus: { hooks: ['hook.guard.file-access'] },
    hooks: { PreToolUse: [] },
  }
  const { settings: merged } = mergeHooks(settings, [GUARD_FRAGMENT])
  assert.ok(hausHookContractSatisfied(merged, CANONICAL))
  assert.equal(merged.hooks.PreToolUse.length, 1)
})

test('does not duplicate a hook already present when _haus tracking was cleared', () => {
  const entry = {
    matcher: 'Read|Edit|Write',
    hooks: [{ type: 'command', command: 'haus guard file-access --from-hook' }],
  }
  const settings = {
    _haus: { hooks: [] },
    hooks: { PreToolUse: [entry] },
  }
  const { settings: merged } = mergeHooks(settings, [GUARD_FRAGMENT])
  assert.equal(merged.hooks.PreToolUse.length, 1)
})

test('records hookCommands when hook entry already exists but tracking was empty', () => {
  const entry = {
    matcher: 'Read|Edit|Write',
    hooks: [{ type: 'command', command: 'haus guard file-access --from-hook' }],
  }
  const settings = {
    _haus: { hooks: ['hook.guard.file-access'], hookCommands: [] },
    hooks: { PreToolUse: [entry] },
  }
  const { settings: merged } = mergeHooks(settings, [GUARD_FRAGMENT])
  assert.deepEqual(merged._haus?.hookCommands, ['haus guard file-access --from-hook'])
})

const PROJECT_GUARD_FRAGMENTS = [
  GUARD_FRAGMENT,
  {
    id: 'haus.guard-bash',
    gate: 'keep',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'haus guard bash --from-hook',
  },
]

test('prunes retired haus context hook entries and tracking on merge', () => {
  const settings = {
    _haus: {
      hooks: ['haus.context-hook', 'haus.guard-file'],
      hookCommands: ['haus context --from-hook', 'haus guard file-access --from-hook'],
    },
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'haus context --from-hook' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Read|Edit|Write',
          hooks: [{ type: 'command', command: 'haus guard file-access --from-hook' }],
        },
      ],
    },
  }
  const { settings: merged } = mergeHooks(settings, PROJECT_GUARD_FRAGMENTS)
  assert.equal(merged.hooks.UserPromptSubmit, undefined)
  assert.equal(
    merged._haus?.hookCommands?.includes('haus context --from-hook'),
    false,
  )
  assert.equal(merged._haus?.hooks?.includes('haus.context-hook'), false)
  assert.ok(merged.hooks.PreToolUse.some((e) => e.matcher === 'Read|Edit|Write'))
  assert.ok(merged.hooks.PreToolUse.some((e) => e.matcher === 'Bash'))
})
