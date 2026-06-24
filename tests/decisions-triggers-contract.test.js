import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { hasSkipToken, isDecisionTriggered, isSecurityTriggered } from '../src/decisions/check.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('decisions-triggers fixture', () => {
  it('loads required trigger keys from library/catalog/decisions-triggers.json', () => {
    const rules = JSON.parse(
      readFileSync(resolve(repoRoot, 'library/catalog/decisions-triggers.json'), 'utf8'),
    )
    for (const key of [
      'decisionsDir',
      'pathGlobs',
      'pathRegex',
      'minFilesChanged',
      'minLinesChanged',
      'exemptGlobs',
      'requiredSections',
      'decisionFilePattern',
    ]) {
      assert.ok(key in rules, `missing key: ${key}`)
    }
    assert.equal(rules.decisionsDir, 'docs/decisions')
  })
})

describe('decisions skip and security', () => {
  it('detects [adr-skip] token', () => {
    assert.equal(hasSkipToken('body\n[adr-skip]\nreason'), true)
  })

  it('flags security paths separately from generic triggers', () => {
    const stats = { files: ['src/api/auth/login.ts'], linesAdded: 3, linesRemoved: 0 }
    assert.equal(isDecisionTriggered(stats), true)
    assert.equal(isSecurityTriggered(stats), true)
  })
})
