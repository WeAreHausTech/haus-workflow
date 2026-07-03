import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { describe, it } from 'node:test'

import YAML from 'yaml'

// Regression: the secret-grep pre-commit hook must only flag quoted-literal
// credential assignments (matching the pattern WORKFLOW.md documents), not bare
// TypeScript field/type declarations like `password: string`. Without the quote
// requirement, committing any catalog doc that types a `password`/`token` field
// is permanently blocked.

const config = YAML.parse(fs.readFileSync(path.resolve('lefthook.yml'), 'utf8'))
const run = config['pre-commit'].commands['secret-grep'].run
const pattern = run.match(/grep -iqE "((?:[^"\\]|\\.)+)"/)?.[1]

function matches(line) {
  try {
    execSync(`printf '%s\\n' ${JSON.stringify(line)} | grep -iqE ${JSON.stringify(pattern)}`, {
      shell: '/bin/bash',
    })
    return true
  } catch {
    return false
  }
}

describe('secret-grep pattern', () => {
  it('extracted a pattern from lefthook.yml', () => {
    assert.ok(pattern, 'secret-grep run script should contain a grep -iqE pattern')
  })

  it('does not flag TypeScript field/type declarations', () => {
    assert.equal(matches('  password: string'), false)
    assert.equal(matches("type UserWithoutPassword = Omit<User, 'password'>"), false)
    assert.equal(matches('  token: string[]'), false)
  })

  it('still flags quoted inline credential literals', () => {
    // Built via concatenation so this test file's own source text doesn't contain a
    // literal credential-shaped assignment and trip the very hook it's testing.
    const passwordLine = 'const ' + 'password' + ' = ' + '"hunter2"'
    const apiKeyLine = 'api_key' + ': ' + "'sk-abc123'"
    const secretLine = 'secret' + ': ' + '"shh"'
    assert.equal(matches(passwordLine), true)
    assert.equal(matches(apiKeyLine), true)
    assert.equal(matches(secretLine), true)
  })
})
