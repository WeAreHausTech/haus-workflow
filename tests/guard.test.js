import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { guardBash } from '../src/security/guard-bash.js'
import { guardFileAccess } from '../src/security/guard-file-access.js'

describe('guardBash', () => {
  it('hard-blocks deny-tier commands', () => {
    assert.ok(guardBash('git push --force origin main'))
    assert.ok(guardBash('sudo rm something'))
    assert.ok(guardBash('npm publish'))
  })

  it('does NOT block ask-tier commands (they go through permissions.ask)', () => {
    assert.equal(guardBash('rm -rf /tmp/x'), undefined)
    assert.equal(guardBash('chown -R user /var'), undefined)
    assert.equal(guardBash('git reset --hard HEAD'), undefined)
    assert.equal(guardBash('docker system prune'), undefined)
    assert.equal(guardBash('php artisan migrate --force'), undefined)
  })

  it('allows an ordinary command', () => {
    assert.equal(guardBash('yarn test'), undefined)
    assert.equal(guardBash('git status'), undefined)
  })

  it('explains the block in plain language while still naming the command (WS6)', () => {
    const msg = guardBash('sudo rm something')
    assert.match(msg, /didn't run that/i)
    assert.match(msg, /sudo rm something/)
  })
})

describe('guardFileAccess', () => {
  it('hard-blocks deny-tier paths', () => {
    assert.ok(guardFileAccess('config/app.pem'))
    assert.ok(guardFileAccess('secrets/token.txt'))
    assert.ok(guardFileAccess('path/to/id_rsa'))
  })

  it('does NOT block ask-tier paths (they go through permissions.ask)', () => {
    assert.equal(guardFileAccess('.env'), undefined)
    assert.equal(guardFileAccess('.env.local'), undefined)
    assert.equal(guardFileAccess('storage/logs/app.log'), undefined)
    assert.equal(guardFileAccess('exports/data.csv'), undefined)
    assert.equal(guardFileAccess('backup.dump'), undefined)
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

// Regression: d562199 — guard reason strings must not contain backticks so
// the JSON permissionDecisionReason field renders safely as Markdown in the UI.
describe('guard reason strings contain no backticks', () => {
  it('guardBash reason has no backticks', () => {
    const msg = guardBash('sudo rm /important')
    assert.ok(msg, 'expected a block message')
    assert.equal(msg.includes('`'), false, 'guard reason must not contain backticks')
  })

  it('guardFileAccess reason has no backticks', () => {
    const msg = guardFileAccess('config/app.pem')
    assert.ok(msg, 'expected a block message')
    assert.equal(msg.includes('`'), false, 'guard reason must not contain backticks')
  })
})
