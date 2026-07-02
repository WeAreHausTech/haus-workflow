import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, mock } from 'node:test'
import { execaSync } from 'execa'

import { runDecisionsGuard } from '../src/commands/decisions-guard.js'

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd, args) {
  return execaSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV } })
}

function makeRepoWithFeatureBranch({ changePackageJson }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-decisions-guard-'))
  git(dir, ['init', '-b', 'main'])
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', 'init'])
  git(dir, ['checkout', '-b', 'feature'])
  if (changePackageJson) {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.1.0"}\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-m', 'bump dep'])
  }
  return dir
}

function withCwd(dir, fn) {
  const original = process.cwd()
  process.chdir(dir)
  return fn().finally(() => process.chdir(original))
}

describe('runDecisionsGuard', () => {
  it('does nothing for a command that is not gh pr create', async () => {
    const dir = makeRepoWithFeatureBranch({ changePackageJson: true })
    const logSpy = mock.method(console, 'log')
    try {
      await withCwd(dir, () =>
        runDecisionsGuard({
          fromHook: true,
          stdinPayload: JSON.stringify({ tool_input: { command: 'git status' } }),
        }),
      )
      assert.equal(logSpy.mock.calls.length, 0)
    } finally {
      logSpy.mock.restore()
    }
  })

  it('denies gh pr create when the diff is decision-worthy and unsatisfied', async () => {
    const dir = makeRepoWithFeatureBranch({ changePackageJson: true })
    const logSpy = mock.method(console, 'log')
    try {
      await withCwd(dir, () =>
        runDecisionsGuard({
          fromHook: true,
          stdinPayload: JSON.stringify({ tool_input: { command: 'gh pr create --fill' } }),
        }),
      )
      assert.equal(logSpy.mock.calls.length, 1)
      const decision = JSON.parse(logSpy.mock.calls[0].arguments[0])
      assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny')
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /ADR/)
    } finally {
      logSpy.mock.restore()
    }
  })

  it('allows gh pr create when the diff is not decision-worthy', async () => {
    const dir = makeRepoWithFeatureBranch({ changePackageJson: false })
    fs.writeFileSync(path.join(dir, 'README.md'), 'docs only\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-m', 'docs'])
    const logSpy = mock.method(console, 'log')
    try {
      await withCwd(dir, () =>
        runDecisionsGuard({
          fromHook: true,
          stdinPayload: JSON.stringify({ tool_input: { command: 'gh pr create --fill' } }),
        }),
      )
      assert.equal(logSpy.mock.calls.length, 0)
    } finally {
      logSpy.mock.restore()
    }
  })
})
