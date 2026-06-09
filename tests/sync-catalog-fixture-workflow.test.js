import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync('.github/workflows/sync-catalog-fixture.yml', 'utf8')
const pushStep = workflow.split('Open or update sync PR')[1] ?? ''

test('fixture-sync records remote SHA before branch reset for force-with-lease', () => {
  assert.match(pushStep, /LEASE_REF="\$\(git rev-parse "origin\/\$BRANCH"\)"/)
  assert.match(pushStep, /--force-with-lease="\$BRANCH:\$LEASE_REF"/)
})

test('fixture-sync re-downloads fixtures after resetting branch to origin/main', () => {
  assert.match(pushStep, /git checkout -B "\$BRANCH" origin\/main/)
  const checkoutIdx = pushStep.indexOf('git checkout -B')
  const curlIdx = pushStep.indexOf('curl -fsSL', checkoutIdx)
  assert.ok(curlIdx > checkoutIdx, 'curl must run after checkout -B')
})
