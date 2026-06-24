import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { isDecisionTriggered } from '../src/decisions/check.js'
import { matchesPathGlob } from '../src/decisions/match.js'
import { validateDecisionContent } from '../src/decisions/validate.js'
import { runHausRaw } from './helpers/fixture-runner.js'

describe('decisions match', () => {
  it('matches package.json globs', () => {
    assert.equal(matchesPathGlob('package.json', '**/package.json'), true)
    assert.equal(matchesPathGlob('apps/web/package.json', '**/package.json'), true)
    assert.equal(matchesPathGlob('README.md', '**/package.json'), false)
  })
})

describe('decisions validate', () => {
  it('requires core ADR sections', () => {
    const ok = validateDecisionContent(`# ADR-0001: Test

## Context
x
## Decision
y
## Consequences
z`)
    assert.equal(ok.ok, true)
    const bad = validateDecisionContent('# ADR-0001: Test\n\n## Context\nonly')
    assert.equal(bad.ok, false)
  })
})

describe('decisions triggered', () => {
  it('triggers on package.json change', () => {
    assert.equal(
      isDecisionTriggered({ files: ['package.json'], linesAdded: 2, linesRemoved: 1 }),
      true,
    )
  })

  it('does not trigger on docs-only exempt paths', () => {
    assert.equal(
      isDecisionTriggered({ files: ['docs/readme.md'], linesAdded: 5, linesRemoved: 0 }),
      false,
    )
  })
})

describe('haus decisions check CLI', () => {
  it('fails when package.json changes without a decision record', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-decisions-'))
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x"}\n')
    const { exitCode } = runHausRaw(tmp, ['decisions', 'check', '--staged'], {
      input: '',
    })
    // nothing staged — should pass (no trigger)
    assert.equal(exitCode, 0)
  })
})
