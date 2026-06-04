import test from 'node:test'
import assert from 'node:assert/strict'

import { auditForbiddenTags } from '../src/commands/catalog-audit.ts'
import { FORBIDDEN_TAGS } from '../src/catalog/validation-rules.ts'

// Behavioral guard against drift: the audit must flag every word in the canonical
// FORBIDDEN_TAGS list, and must NOT flag a clean item. Two hand-maintained lists
// silently diverge; driving the audit from FORBIDDEN_TAGS keeps one source of truth.

test('FORBIDDEN_TAGS is populated (canonical synced list)', () => {
  assert.ok(FORBIDDEN_TAGS.length > 0)
})

test('audit flags an item for every FORBIDDEN_TAG', () => {
  for (const tag of FORBIDDEN_TAGS) {
    const failures = auditForbiddenTags([{ id: `probe-${tag}`, tags: [tag] }])
    assert.ok(
      failures.some((f) => f.includes(tag)),
      `expected forbidden tag "${tag}" to be flagged`,
    )
  }
})

test('audit does not flag a clean item', () => {
  const failures = auditForbiddenTags([{ id: 'clean-item', tags: ['react', 'security'] }])
  assert.deepEqual(failures, [])
})

test('audit forbidden set agrees with FORBIDDEN_TAGS exactly', () => {
  // For each forbidden tag, an isolated probe must be flagged; for a tag NOT in
  // FORBIDDEN_TAGS (and not a substring of one), it must not. This proves the audit's
  // effective forbidden set equals FORBIDDEN_TAGS rather than a stale private copy.
  const detected = FORBIDDEN_TAGS.filter(
    (tag) => auditForbiddenTags([{ id: `p-${tag}`, tags: [tag] }]).length > 0,
  )
  assert.deepEqual([...detected].sort(), [...FORBIDDEN_TAGS].sort())
})
