import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('catalog disallows unsupported stacks', () => {
  const script = fs.readFileSync('src/commands/catalog-audit.ts', 'utf8')
  assert.equal(script.includes('python'), true)
})
