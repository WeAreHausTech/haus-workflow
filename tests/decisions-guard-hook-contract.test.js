import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { execaSync } from 'execa'

import { runHausRaw } from './helpers/fixture-runner.js'

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd, args) {
  execaSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV } })
}

function fixtureWithUnsatisfiedAdrTrigger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-decisions-guard-e2e-'))
  git(dir, ['init', '-b', 'main'])
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', 'init'])
  git(dir, ['checkout', '-b', 'feature'])
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.1.0"}\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', 'bump dep'])
  return dir
}

function guardFromHook(cwd, command) {
  return runHausRaw(cwd, ['decisions', 'guard', '--from-hook'], {
    input: JSON.stringify({ tool_input: { command } }),
  })
}

describe('decisions guard PreToolUse hook contract', () => {
  it('denies gh pr create with nested deny JSON + exit 0 when the diff needs an ADR', () => {
    const dir = fixtureWithUnsatisfiedAdrTrigger()
    const { stdout, exitCode } = guardFromHook(dir, 'gh pr create --fill')
    assert.equal(exitCode, 0)
    const decision = JSON.parse(stdout)
    assert.equal(decision.hookSpecificOutput.hookEventName, 'PreToolUse')
    assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(decision.hookSpecificOutput.permissionDecisionReason, /ADR/)
  })

  it('allows a non-gh-pr-create bash command with no output + exit 0', () => {
    const dir = fixtureWithUnsatisfiedAdrTrigger()
    const { stdout, exitCode } = guardFromHook(dir, 'git status')
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })
})
