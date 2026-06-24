import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runHausRaw } from './helpers/fixture-runner.js'

// These tests exercise the Claude Code PreToolUse hook I/O contract end-to-end
// against the built dist/cli.js: a JSON payload arrives on stdin, and the guard
// must answer with the exact stdout shape + exit code Claude Code consumes.
//
// CONTRACT (https://code.claude.com/docs/en/hooks.md): to deny a tool call a
// PreToolUse hook MUST print, on stdout, the verdict nested under
// `hookSpecificOutput` with `hookEventName: "PreToolUse"`, AND exit 0 — Claude
// Code only parses hook JSON on exit 0, and ignores a bare top-level
// `permissionDecision`. Either mistake makes the guard fail OPEN (the dangerous
// command/path is allowed). We assert the exact wire shape so a regression that
// silently disables enforcement is caught here.

const CWD = process.cwd()

function guard(kind, payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return runHausRaw(CWD, ['guard', kind, '--from-hook'], { input })
}

/** Asserts a stdout string carries a correctly-shaped PreToolUse deny verdict. */
function assertDeny(stdout) {
  const decision = JSON.parse(stdout)
  assert.ok(decision.hookSpecificOutput, 'verdict must be nested under hookSpecificOutput')
  assert.equal(decision.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny')
  return decision.hookSpecificOutput
}

describe('guard hook contract: bash', () => {
  it('denies a dangerous command with nested deny JSON + exit 0', () => {
    const { stdout, exitCode } = guard('bash', { tool_input: { command: 'sudo rm /' } })
    // Exit 0 is mandatory: a non-zero exit makes Claude Code discard the JSON.
    assert.equal(exitCode, 0)
    const out = assertDeny(stdout)
    assert.ok(
      typeof out.permissionDecisionReason === 'string' && out.permissionDecisionReason.length > 0,
      'expected a non-empty permissionDecisionReason',
    )
    // The human reads this reason in the terminal; backticks render badly.
    assert.ok(!out.permissionDecisionReason.includes('`'), 'reason must not contain backticks')
  })

  it('allows a safe command with no output + exit 0', () => {
    const { stdout, exitCode } = guard('bash', { tool_input: { command: 'yarn test' } })
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })
})

describe('guard hook contract: file-access', () => {
  it('denies a deny-tier path (file_path key) with nested deny + exit 0', () => {
    const { stdout, exitCode } = guard('file-access', {
      tool_input: { file_path: 'secrets/token.txt' },
    })
    assert.equal(exitCode, 0)
    assertDeny(stdout)
  })

  it('denies a secret path via the `path` alias key with nested deny + exit 0', () => {
    // guard.ts reads `toolInput.path ?? toolInput.file_path`; cover the alias.
    const { stdout, exitCode } = guard('file-access', { tool_input: { path: 'config/app.pem' } })
    assert.equal(exitCode, 0)
    assertDeny(stdout)
  })
})

describe('guard hook contract: malformed and empty input', () => {
  it('fails closed on a malformed payload with the documented reason + exit 0', () => {
    const { stdout, exitCode } = guard('bash', '{not json')
    assert.equal(exitCode, 0)
    const out = assertDeny(stdout)
    assert.equal(out.permissionDecisionReason, 'Malformed hook payload')
  })

  it('allows empty stdin (treated as {}) with no output + exit 0', () => {
    const { stdout, exitCode } = guard('bash', '')
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })
})
