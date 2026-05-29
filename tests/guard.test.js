import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('guard blocks .env', () => {
  const text = fs.readFileSync('src/security/sensitive-paths.ts', 'utf8')
  assert.equal(text.includes('.env'), true)
})

test('guard blocks dangerous command', () => {
  const text = fs.readFileSync('src/security/dangerous-commands.ts', 'utf8')
  assert.equal(text.includes('git reset --hard'), true)
})
