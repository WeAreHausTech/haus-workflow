import test from 'node:test'
import assert from 'node:assert/strict'

import { normaliseLF, parseHausManagedHeader } from '../src/claude/managed-template.js'

// normaliseLF

test('normaliseLF: CRLF is converted to LF', () => {
  assert.equal(normaliseLF('hello\r\nworld'), 'hello\nworld')
})

test('normaliseLF: CR-only is converted to LF', () => {
  assert.equal(normaliseLF('hello\rworld'), 'hello\nworld')
})

test('normaliseLF: LF-only is unchanged', () => {
  assert.equal(normaliseLF('hello\nworld'), 'hello\nworld')
})

test('normaliseLF: mixed CRLF + CR + LF all become LF', () => {
  assert.equal(normaliseLF('a\r\nb\rc\nd'), 'a\nb\nc\nd')
})

test('normaliseLF: empty string is unchanged', () => {
  assert.equal(normaliseLF(''), '')
})

// parseHausManagedHeader

test('parseHausManagedHeader: valid header with hash returns id and hash', () => {
  const line =
    '<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.13.0 hash=sha256-abc123def456 -->'
  assert.deepEqual(parseHausManagedHeader(line), {
    id: 'template.workflow',
    v: 1,
    source: '@haus-tech/haus-workflow@0.13.0',
    hash: 'sha256-abc123def456',
  })
})

test('parseHausManagedHeader: valid header without hash field returns id with hash undefined', () => {
  const line = '<!-- HAUS-MANAGED id=skill.haus-workflow v=1 source=haus@0.1.0 -->'
  assert.deepEqual(parseHausManagedHeader(line), {
    id: 'skill.haus-workflow',
    v: 1,
    source: 'haus@0.1.0',
    hash: undefined,
  })
})

test('parseHausManagedHeader: non-managed comment returns null', () => {
  assert.equal(parseHausManagedHeader('# just a comment'), null)
})

test('parseHausManagedHeader: empty string returns null', () => {
  assert.equal(parseHausManagedHeader(''), null)
})

test('parseHausManagedHeader: id with dots is parsed correctly', () => {
  const line = '<!-- HAUS-MANAGED id=template.workflow v=1 -->'
  const result = parseHausManagedHeader(line)
  assert.equal(result?.id, 'template.workflow')
})

test('parseHausManagedHeader: id with colon is parsed correctly', () => {
  const line = '<!-- HAUS-MANAGED id=command.haus-doctor:v2 v=1 -->'
  const result = parseHausManagedHeader(line)
  assert.equal(result?.id, 'command.haus-doctor:v2')
})

test('parseHausManagedHeader: id with dash is parsed correctly', () => {
  const line = '<!-- HAUS-MANAGED id=skill.haus-workflow v=1 -->'
  const result = parseHausManagedHeader(line)
  assert.equal(result?.id, 'skill.haus-workflow')
})

test('parseHausManagedHeader: hash field with wrong prefix is not captured', () => {
  const line = '<!-- HAUS-MANAGED id=template.workflow v=1 hash=md5-abc123 -->'
  const result = parseHausManagedHeader(line)
  assert.equal(result?.hash, undefined)
})
