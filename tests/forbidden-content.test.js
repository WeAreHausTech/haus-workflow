import test from 'node:test'
import assert from 'node:assert/strict'

import {
  auditForbiddenTagsInText,
  extractFrontmatterDescription,
  extractFrontmatterValue,
} from '../src/catalog/forbidden-content.js'

test('extractFrontmatterDescription reads folded YAML block scalars', () => {
  const md = `---
name: demo
description: >-
  Use when doing multi-line description work.
other: x
---
`
  assert.match(extractFrontmatterDescription(md), /multi-line description/)
})

test('extractFrontmatterDescription reads literal block scalars and header variants', () => {
  const literal = `---
description: |
  Line one
  Line two
---
`
  assert.match(extractFrontmatterDescription(literal), /Line one.*Line two/)

  const comment = `---
description: >- # folded with comment
  Commented header body.
---
`
  assert.match(extractFrontmatterDescription(comment), /Commented header body/)

  const indent = `---
description: >2
  Indented block body.
---
`
  assert.match(extractFrontmatterDescription(indent), /Indented block body/)
})

test('extractFrontmatterValue reads arbitrary frontmatter keys', () => {
  const md = `---
name: demo
other: arbitrary scalar value
description: ignored when reading other
---
`
  assert.equal(extractFrontmatterValue(md, 'other'), 'arbitrary scalar value')
  assert.equal(extractFrontmatterValue(md, 'missing'), '')
})

test('extractFrontmatterDescription returns empty for bare description key', () => {
  const md = `---
name: demo
description:
  should not be consumed
other: x
---
`
  assert.equal(extractFrontmatterDescription(md), '')
})

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
