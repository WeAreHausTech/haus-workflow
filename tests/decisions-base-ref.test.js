import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { execaSync } from 'execa'

import { resolveBaseRef } from '../src/decisions/base-ref.js'

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd, args) {
  return execaSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV } })
}

function initRepo(defaultBranch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-base-ref-'))
  git(dir, ['init', '-b', defaultBranch])
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', 'init'])
  return dir
}

describe('resolveBaseRef', () => {
  it('resolves origin/HEAD when a remote default branch is configured', async () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-base-ref-bare-'))
    git(bareDir, ['init', '--bare', '-b', 'main'])
    const workDir = initRepo('main')
    git(workDir, ['remote', 'add', 'origin', bareDir])
    git(workDir, ['push', 'origin', 'main'])
    git(workDir, ['remote', 'set-head', 'origin', 'main'])

    assert.equal(await resolveBaseRef(workDir), 'origin/main')
  })

  it('falls back to a local main branch when no remote is configured', async () => {
    const dir = initRepo('main')
    assert.equal(await resolveBaseRef(dir), 'main')
  })

  it('falls back to a local master branch when main does not exist', async () => {
    const dir = initRepo('master')
    assert.equal(await resolveBaseRef(dir), 'master')
  })

  it('returns undefined when no base branch can be resolved', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-base-ref-empty-'))
    git(dir, ['init', '-b', 'scratch'])
    assert.equal(await resolveBaseRef(dir), undefined)
  })
})
