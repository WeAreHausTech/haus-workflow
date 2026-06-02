import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { guardBash } from '../src/security/guard-bash.js'
import { guardFileAccess } from '../src/security/guard-file-access.js'

describe('guardBash', () => {
  it('blocks a dangerous command', () => {
    assert.ok(guardBash('rm -rf /tmp/x'))
    assert.ok(guardBash('git push --force origin main'))
    assert.ok(guardBash('sudo rm something'))
  })

  it('allows an ordinary command', () => {
    assert.equal(guardBash('yarn test'), undefined)
    assert.equal(guardBash('git status'), undefined)
  })

  it('explains the block in plain language while still naming the command (WS6)', () => {
    const msg = guardBash('rm -rf /tmp/x')
    assert.match(msg, /didn't run that/i)
    assert.match(msg, /rm -rf \/tmp\/x/)
  })
})

describe('guardFileAccess', () => {
  it('blocks a sensitive path', () => {
    assert.ok(guardFileAccess('.env'))
    assert.ok(guardFileAccess('config/app.pem'))
    assert.ok(guardFileAccess('secrets/token.txt'))
  })

  it('allows an ordinary path', () => {
    assert.equal(guardFileAccess('src/index.ts'), undefined)
    assert.equal(guardFileAccess('README.md'), undefined)
  })

  it('explains the block in plain language while still naming the path (WS6)', () => {
    const msg = guardFileAccess('config/app.pem')
    assert.match(msg, /didn't open/i)
    assert.match(msg, /config\/app\.pem/)
  })
})
