import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Unit coverage for the ownership-marker logic (ADR-0006). Two marker forms must
// round-trip through parseMarkdownHeader to the same HausHeader:
//   1. plain docs   → top-line `<!-- HAUS-MANAGED ... -->` comment
//   2. frontmatter  → `haus_managed: "..."` field inside the leading `---` block
// stampMarkdown routes by content shape, keeps `---` on line 1 for skills, and is
// idempotent. A bug here silently de-registers a skill or clobbers a user file.

const H = { stableId: 'skill.haus-workflow', schemaVersion: '1', source: '@haus-tech/haus-workflow@0.16.2' }

const FRONTMATTER_DOC = `---
name: haus-workflow
description: All-in-one workflow skill.
---

# haus-workflow

body
`

const PLAIN_DOC = `# Some doc

content
`

describe('header — comment form (plain docs)', () => {
  it('stamps a top-line HTML comment and parses it back', async () => {
    const { stampMarkdown, parseMarkdownHeader } = await import('../src/install/header.js')
    const out = stampMarkdown(PLAIN_DOC, H)
    assert.ok(out.split('\n')[0].startsWith('<!-- HAUS-MANAGED'), 'line 1 is the comment')
    assert.deepEqual(parseMarkdownHeader(out), H)
  })

  it('re-stamp replaces the comment, does not stack', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const once = stampMarkdown(PLAIN_DOC, H)
    const twice = stampMarkdown(once, H)
    assert.equal(twice, once, 're-stamp is idempotent')
    assert.equal(twice.match(/HAUS-MANAGED/g).length, 1, 'exactly one marker')
  })

  it('is idempotent for a bare header with no trailing newline', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const once = stampMarkdown('# doc', H).split('\n')[0] // build a header line
    // A file that is exactly the header line, no newline, no body.
    const bare = stampMarkdown('# doc', H).split('\n')[0]
    const stamped = stampMarkdown(bare, H)
    assert.equal(stamped, once, 're-stamp of a bare header does not duplicate it')
    assert.equal(stamped.match(/HAUS-MANAGED/g).length, 1, 'exactly one marker')
  })

  it('preserves doc body after the comment', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const out = stampMarkdown(PLAIN_DOC, H)
    assert.ok(out.includes('# Some doc'), 'body retained')
  })
})

describe('header — frontmatter form (skills)', () => {
  it('keeps --- on line 1 and injects the haus_managed field', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const out = stampMarkdown(FRONTMATTER_DOC, H)
    const lines = out.split('\n')
    assert.equal(lines[0], '---', 'line 1 stays the frontmatter fence')
    assert.ok(!lines[0].includes('HAUS-MANAGED'), 'no comment pushed onto line 1')
    assert.ok(/^haus_managed:\s*"/.test(lines.find((l) => l.startsWith('haus_managed:'))), 'field present')
  })

  it('parses the marker back out of the frontmatter block', async () => {
    const { stampMarkdown, parseMarkdownHeader } = await import('../src/install/header.js')
    const out = stampMarkdown(FRONTMATTER_DOC, H)
    assert.deepEqual(parseMarkdownHeader(out), H)
  })

  it('preserves name and description', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const out = stampMarkdown(FRONTMATTER_DOC, H)
    assert.ok(out.includes('name: haus-workflow'), 'name kept')
    assert.ok(out.includes('description: All-in-one workflow skill.'), 'description kept')
  })

  it('re-stamp is idempotent (single haus_managed field)', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const once = stampMarkdown(FRONTMATTER_DOC, H)
    const twice = stampMarkdown(once, H)
    assert.equal(twice, once, 're-stamp produces identical output')
    assert.equal((twice.match(/^haus_managed:/gm) ?? []).length, 1, 'exactly one field')
  })

  it('updates the marker value on version change without duplicating', async () => {
    const { stampMarkdown, parseMarkdownHeader } = await import('../src/install/header.js')
    const once = stampMarkdown(FRONTMATTER_DOC, H)
    const bumped = stampMarkdown(once, { ...H, source: '@haus-tech/haus-workflow@0.17.0' })
    assert.equal((bumped.match(/^haus_managed:/gm) ?? []).length, 1, 'still one field')
    assert.equal(parseMarkdownHeader(bumped).source, '@haus-tech/haus-workflow@0.17.0')
  })

  it('keeps the closing --- and body intact', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const out = stampMarkdown(FRONTMATTER_DOC, H)
    assert.equal((out.match(/^---$/gm) ?? []).length, 2, 'open + close fences')
    assert.ok(out.includes('# haus-workflow'), 'body retained')
  })
})

describe('header — CRLF line endings (Windows / autocrlf checkout)', () => {
  it('treats a CRLF frontmatter file as frontmatter, not a plain doc', async () => {
    const { stampMarkdown } = await import('../src/install/header.js')
    const crlf = FRONTMATTER_DOC.replace(/\n/g, '\r\n')
    const out = stampMarkdown(crlf, H)
    const firstLine = out.split('\n')[0].replace(/\r$/, '')
    assert.equal(firstLine, '---', 'line 1 stays the fence — no comment prepended')
    assert.ok(!out.split('\n')[0].includes('HAUS-MANAGED'), 'no marker on line 1')
  })

  it('parses the marker back from a stamped CRLF file', async () => {
    const { stampMarkdown, parseMarkdownHeader } = await import('../src/install/header.js')
    const crlf = FRONTMATTER_DOC.replace(/\n/g, '\r\n')
    const out = stampMarkdown(crlf, H)
    assert.deepEqual(parseMarkdownHeader(out), H)
  })
})

describe('header — parse misses', () => {
  it('returns undefined for an unmanaged plain doc', async () => {
    const { parseMarkdownHeader } = await import('../src/install/header.js')
    assert.equal(parseMarkdownHeader(PLAIN_DOC), undefined)
  })

  it('returns undefined for frontmatter without the field', async () => {
    const { parseMarkdownHeader } = await import('../src/install/header.js')
    assert.equal(parseMarkdownHeader(FRONTMATTER_DOC), undefined)
  })
})
