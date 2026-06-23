import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Unit tests import TypeScript source directly via tsx (see package.json "test").
import {
  PRETTIERIGNORE_BEGIN,
  PRETTIERIGNORE_END,
  buildPrettierIgnoreBlock,
  injectPrettierIgnoreBlock,
  stripPrettierIgnoreBlock,
  writePrettierIgnore,
} from '../src/claude/write-prettierignore.js'

describe('write-prettierignore: block content', () => {
  it('ignores the fully haus-owned .haus-workflow/ directory', () => {
    // Root cause: prettier reformats the managed WORKFLOW.md body on commit, breaking
    // the content hash embedded in its HAUS-MANAGED header so doctor reports a phantom
    // user edit. Excluding .haus-workflow/ from the formatter keeps the hash stable.
    const block = buildPrettierIgnoreBlock()
    assert.ok(block.startsWith(PRETTIERIGNORE_BEGIN), 'block opens with the begin sentinel')
    assert.ok(block.trimEnd().endsWith(PRETTIERIGNORE_END), 'block closes with the end sentinel')
    assert.match(block, /^\.haus-workflow\/$/m, 'block lists the managed output dir')
  })
})

describe('write-prettierignore: injectPrettierIgnoreBlock', () => {
  const block = buildPrettierIgnoreBlock()

  it('creates content from empty input', () => {
    const out = injectPrettierIgnoreBlock('', block)
    assert.ok(out.includes('.haus-workflow/'))
    assert.ok(out.endsWith('\n'))
  })

  it('preserves user content and appends the block once', () => {
    const user = 'dist/\ncoverage/\n'
    const out = injectPrettierIgnoreBlock(user, block)
    assert.ok(out.startsWith('dist/\ncoverage/'), 'user entries kept')
    assert.ok(out.includes(PRETTIERIGNORE_BEGIN))
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1, 'exactly one managed block')
  })

  it('is idempotent — re-injecting replaces, never duplicates', () => {
    const once = injectPrettierIgnoreBlock('dist/\n', block)
    const twice = injectPrettierIgnoreBlock(once, block)
    assert.equal(twice, once)
    assert.equal(twice.match(/HAUS:BEGIN/g)?.length, 1)
  })

  it('refreshes a stale managed block in place, keeping user content', () => {
    const stale = 'dist/\n# HAUS:BEGIN haus-managed v=1\nold-entry/\n# HAUS:END haus-managed\n'
    const out = injectPrettierIgnoreBlock(stale, block)
    assert.ok(!out.includes('old-entry/'), 'stale entry replaced')
    assert.ok(out.includes('.haus-workflow/'))
    assert.ok(out.startsWith('dist/'), 'user content preserved')
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1)
  })

  it('preserves user blank lines outside the managed block on refresh', () => {
    const withGaps = 'dist/\n\n\n\ncoverage/\n# HAUS:BEGIN haus-managed v=1\nold/\n# HAUS:END haus-managed\n'
    const out = injectPrettierIgnoreBlock(withGaps, block)
    assert.ok(out.startsWith('dist/\n\n\n\ncoverage/'), 'user blank lines kept')
  })

  it('repairs a malformed file with BEGIN but no END', () => {
    const broken = 'dist/\n# HAUS:BEGIN haus-managed v=1\norphan-entry/\n'
    const out = injectPrettierIgnoreBlock(broken, block)
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1)
    assert.ok(!out.includes('orphan-entry/'))
    assert.ok(out.includes('.haus-workflow/'))
    assert.ok(out.startsWith('dist/'))
  })
})

describe('write-prettierignore: stripPrettierIgnoreBlock', () => {
  it('removes the managed block, leaving user content intact', () => {
    const withBlock = injectPrettierIgnoreBlock('dist/\n', buildPrettierIgnoreBlock())
    const stripped = stripPrettierIgnoreBlock(withBlock)
    assert.ok(!stripped.includes('HAUS:BEGIN'))
    assert.ok(stripped.includes('dist/'))
  })

  it('returns empty string when the file held only the managed block', () => {
    const onlyBlock = injectPrettierIgnoreBlock('', buildPrettierIgnoreBlock())
    assert.equal(stripPrettierIgnoreBlock(onlyBlock), '')
  })

  it('preserves leading whitespace in user content', () => {
    const withLeading = '\n\ndist/\n' + buildPrettierIgnoreBlock() + '\n'
    const stripped = stripPrettierIgnoreBlock(withLeading)
    assert.ok(stripped.startsWith('\n\ndist/'), 'leading newlines kept')
  })
})

describe('write-prettierignore: writePrettierIgnore', () => {
  let tmpDir
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-prettierignore-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes .prettierignore covering .haus-workflow/', async () => {
    const out = await writePrettierIgnore(tmpDir, false)
    assert.equal(out, path.join(tmpDir, '.prettierignore'))
    const content = fs.readFileSync(out, 'utf8')
    assert.match(content, /^\.haus-workflow\/$/m)
  })

  it('dry-run writes nothing to disk', async () => {
    await writePrettierIgnore(tmpDir, true)
    assert.equal(fs.existsSync(path.join(tmpDir, '.prettierignore')), false)
  })

  it('merges into an existing .prettierignore without clobbering it', async () => {
    const file = path.join(tmpDir, '.prettierignore')
    fs.writeFileSync(file, 'build/\n')
    await writePrettierIgnore(tmpDir, false)
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.includes('build/'), 'pre-existing entry preserved')
    assert.match(content, /^\.haus-workflow\/$/m)
  })
})
