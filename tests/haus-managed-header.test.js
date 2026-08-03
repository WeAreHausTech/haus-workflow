import test from 'node:test'
import assert from 'node:assert/strict'

import { parseHausManagedAttrs } from '../src/claude/haus-managed-header.js'

// Direct unit coverage for the shared HAUS-MANAGED comment parser (audit CLI §7:
// zero direct test file exercised this before, only transitively via header.test.js
// and doctor-tamper.test.js which go through the higher-level stampMarkdown/doctor
// paths). Every tamper check downstream reads through this one regex.

test('parses id, v, source, hash attrs from a full marker line', () => {
  const line = '<!-- HAUS-MANAGED id=template.workflow v=3 source=@haus-tech/haus-workflow@0.16.2 hash=sha256-abc123 -->'
  assert.deepEqual(parseHausManagedAttrs(line), {
    id: 'template.workflow',
    v: '3',
    source: '@haus-tech/haus-workflow@0.16.2',
    hash: 'sha256-abc123',
  })
})

test('parses a minimal marker with only id', () => {
  const line = '<!-- HAUS-MANAGED id=skill.foo -->'
  assert.deepEqual(parseHausManagedAttrs(line), {
    id: 'skill.foo',
    v: undefined,
    source: undefined,
    hash: undefined,
  })
})

test('tolerates surrounding whitespace on the line', () => {
  const line = '   <!-- HAUS-MANAGED id=skill.foo -->   '
  assert.deepEqual(parseHausManagedAttrs(line)?.id, 'skill.foo')
})

test('returns null when id attribute is missing', () => {
  const line = '<!-- HAUS-MANAGED v=1 source=@haus-tech/haus-workflow@0.16.2 -->'
  assert.equal(parseHausManagedAttrs(line), null)
})

test('returns null for a plain HTML comment that is not a HAUS-MANAGED marker', () => {
  assert.equal(parseHausManagedAttrs('<!-- just a comment -->'), null)
})

test('returns null for a non-comment line', () => {
  assert.equal(parseHausManagedAttrs('# Some heading'), null)
})

test('returns null for an unterminated marker (no closing -->)', () => {
  assert.equal(parseHausManagedAttrs('<!-- HAUS-MANAGED id=skill.foo'), null)
})

test('ignores unrecognised attribute keys without failing', () => {
  const line = '<!-- HAUS-MANAGED id=skill.foo bogus=whatever -->'
  const attrs = parseHausManagedAttrs(line)
  assert.equal(attrs?.id, 'skill.foo')
  assert.equal('bogus' in (attrs ?? {}), false)
})

test('last value wins when an attribute key is repeated', () => {
  const line = '<!-- HAUS-MANAGED id=skill.foo id=skill.bar -->'
  assert.equal(parseHausManagedAttrs(line)?.id, 'skill.bar')
})

test('a double-dash inside a value does not confuse the non-greedy comment-close match', () => {
  // "--" alone is not the comment terminator ("-->"), so this must still parse cleanly.
  const line = '<!-- HAUS-MANAGED id=skill.foo hash=sha256-ab--cd -->'
  assert.deepEqual(parseHausManagedAttrs(line)?.hash, 'sha256-ab--cd')
})

test('documents current behavior: a literal ">" inside a value truncates that attribute early', () => {
  // Pinning this down, not endorsing it — the attribute-value char class excludes ">",
  // so a value containing "-->" is cut right before the closing bracket, and the text
  // after it ("value") is silently dropped since it has no "key=" of its own. If this
  // ever changes, update this test to assert the fixed behavior.
  const line = '<!-- HAUS-MANAGED id=skill.foo hash=weird-->value -->'
  const attrs = parseHausManagedAttrs(line)
  assert.equal(attrs?.hash, 'weird--', 'value truncated right before the ">" character')
  assert.equal(attrs?.id, 'skill.foo', 'earlier attributes are unaffected')
})
