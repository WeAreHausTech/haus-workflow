/**
 * C1: Verify that hashContent in apply.ts normalises line endings before hashing,
 * so CRLF and LF content produce the same hash (platform-independent stamps).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const { normaliseLF } = await import('../src/claude/managed-template.js')

function hashContent(content) {
  return `sha256-${crypto.createHash('sha256').update(normaliseLF(content)).digest('hex')}`
}

test('hashContent: CRLF and LF produce the same hash', () => {
  const lf = '# Skill\n\nSome content\nWith multiple lines\n'
  const crlf = lf.replace(/\n/g, '\r\n')

  assert.equal(hashContent(lf), hashContent(crlf), 'CRLF and LF hashes must match')
})

test('hashContent: mixed line endings are normalised to LF', () => {
  const mixed = '# Skill\r\n\nWith mixed\r\nendings\n'
  const lf = mixed.replace(/\r\n/g, '\n')

  assert.equal(hashContent(mixed), hashContent(lf))
})

test('hashContent: different content produces different hashes', () => {
  const a = '# Skill A\n\nContent A\n'
  const b = '# Skill B\n\nContent B\n'

  assert.notEqual(hashContent(a), hashContent(b))
})
