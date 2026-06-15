import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runHausRaw } from './helpers/fixture-runner.js'

// These tests exercise the Claude Code PreToolUse hook I/O contract end-to-end
// against the built dist/cli.js: a JSON payload arrives on stdin, and the guard
// must answer with the exact stdout shape + exit code Claude Code consumes.
// A renamed JSON key or dropped exit code would silently disable enforcement
// inside Claude Code, so we test the wire contract, not the pure guard functions.

const CWD = process.cwd()

function guard(kind, payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return runHausRaw(CWD, ['guard', kind, '--from-hook'], { input })
}

describe('guard hook contract: bash', () => {
  it('denies a dangerous command with deny JSON + exit 1', () => {
    const { stdout, exitCode } = guard('bash', { tool_input: { command: 'sudo rm /' } })
    assert.equal(exitCode, 1)
    const decision = JSON.parse(stdout)
    assert.equal(decision.permissionDecision, 'deny')
    assert.ok(
      typeof decision.permissionDecisionReason === 'string' &&
        decision.permissionDecisionReason.length > 0,
      'expected a non-empty permissionDecisionReason',
    )
    // The human reads this reason in the terminal; backticks render badly.
    assert.ok(!decision.permissionDecisionReason.includes('`'), 'reason must not contain backticks')
  })

  it('allows a safe command with no output + exit 0', () => {
    const { stdout, exitCode } = guard('bash', { tool_input: { command: 'yarn test' } })
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })
})

describe('guard hook contract: file-access', () => {
  it('denies a deny-tier path (file_path key) with deny + exit 1', () => {
    const { stdout, exitCode } = guard('file-access', {
      tool_input: { file_path: 'secrets/token.txt' },
    })
    assert.equal(exitCode, 1)
    assert.equal(JSON.parse(stdout).permissionDecision, 'deny')
  })

  it('denies a secret path via the `path` alias key with deny + exit 1', () => {
    // guard.ts reads `toolInput.path ?? toolInput.file_path`; cover the alias.
    const { stdout, exitCode } = guard('file-access', { tool_input: { path: 'config/app.pem' } })
    assert.equal(exitCode, 1)
    assert.equal(JSON.parse(stdout).permissionDecision, 'deny')
  })
})

describe('guard hook contract: malformed and empty input', () => {
  it('denies a malformed payload with the documented reason + exit 1', () => {
    const { stdout, exitCode } = guard('bash', '{not json')
    assert.equal(exitCode, 1)
    const decision = JSON.parse(stdout)
    assert.equal(decision.permissionDecision, 'deny')
    assert.equal(decision.permissionDecisionReason, 'Malformed hook payload')
  })

  it('allows empty stdin (treated as {}) with no output + exit 0', () => {
    const { stdout, exitCode } = guard('bash', '')
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })
})
