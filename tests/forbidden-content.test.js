import test from 'node:test'
import assert from 'node:assert/strict'

import { auditForbiddenTagsInText } from '../src/catalog/forbidden-content.js'

test('auditForbiddenTagsInText flags forbidden stacks in Use when only', () => {
  const text = `## Use when\n- building python django APIs\n## Do not use when\n- native android apps`
  const failures = auditForbiddenTagsInText(text, 'sample.md')
  assert.ok(failures.some((f) => f.includes('python')))
  assert.equal(
    failures.some((f) => f.includes('android')),
    false,
  )
})

test('auditForbiddenTagsInText ignores go-live and Go binary prose', () => {
  const text = `## Use when\n- ship go-live migrations with Lefthook (Go binary)`
  assert.deepEqual(auditForbiddenTagsInText(text, 'sample.md'), [])
})
