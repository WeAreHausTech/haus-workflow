import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Unit tests import TypeScript source directly via tsx (see package.json "test").
import {
  GITIGNORE_BEGIN,
  GITIGNORE_END,
  GITIGNORED_ARTIFACT_PATHS,
  buildGitignoreBlock,
  gitignoreCovers,
  injectGitignoreBlock,
  stripGitignoreBlock,
} from '../src/claude/write-gitignore.js'

describe('write-gitignore: block content', () => {
  it('covers the four machine-local scan artifacts', () => {
    // Root cause: context-map.json/recommendation.json/sources-report.json/
    // deep-context.json carry machine-local absolute paths and per-developer scan
    // output — they should never have been tracked in a consumer repo (ADR-0025).
    const block = buildGitignoreBlock()
    assert.ok(block.startsWith(GITIGNORE_BEGIN), 'block opens with the begin sentinel')
    assert.ok(block.trimEnd().endsWith(GITIGNORE_END), 'block closes with the end sentinel')
    for (const p of GITIGNORED_ARTIFACT_PATHS) {
      assert.match(block, new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), p)
    }
  })

  it('deliberately excludes haus.lock.json and setup-answers.json', () => {
    // haus.lock.json is a registry of installed catalog content — repo-owned, must
    // stay tracked. setup-answers.json has no writer anywhere in src/library today
    // (see ADR-0025) — not handled here, on purpose.
    const block = buildGitignoreBlock()
    assert.equal(block.includes('haus.lock.json'), false)
    assert.equal(block.includes('setup-answers.json'), false)
  })
})

describe('gitignoreCovers', () => {
  it('accepts an exact verbatim entry', () => {
    assert.equal(gitignoreCovers(['.haus-workflow/context-map.json'], '.haus-workflow/context-map.json'), true)
    assert.equal(gitignoreCovers(['/.haus-workflow/context-map.json'], '.haus-workflow/context-map.json'), true)
  })

  it('accepts a broader directory pattern that already covers the entry', () => {
    for (const dirLine of ['.haus-workflow/', '.haus-workflow', '/.haus-workflow/', '.haus-workflow/**']) {
      assert.equal(
        gitignoreCovers([dirLine], '.haus-workflow/context-map.json'),
        true,
        `expected ${dirLine} to cover`,
      )
    }
  })

  it('rejects unrelated entries', () => {
    assert.equal(gitignoreCovers(['dist/', 'coverage/'], '.haus-workflow/context-map.json'), false)
    assert.equal(
      gitignoreCovers(['.haus-workflow-other/'], '.haus-workflow/context-map.json'),
      false,
    )
  })

  it('ignores comment and blank lines', () => {
    assert.equal(
      gitignoreCovers(['# .haus-workflow/context-map.json', ''], '.haus-workflow/context-map.json'),
      false,
    )
  })
})

describe('write-gitignore: injectGitignoreBlock', () => {
  it('creates content from empty input', () => {
    const out = injectGitignoreBlock('')
    assert.ok(out.includes('.haus-workflow/context-map.json'))
    assert.ok(out.endsWith('\n'))
  })

  it('preserves user content and appends the block once', () => {
    const user = 'dist/\ncoverage/\n'
    const out = injectGitignoreBlock(user)
    assert.ok(out.startsWith('dist/\ncoverage/'), 'user entries kept')
    assert.ok(out.includes(GITIGNORE_BEGIN))
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1, 'exactly one managed block')
  })

  it('is idempotent — re-injecting produces the same content, never duplicates', () => {
    const once = injectGitignoreBlock('dist/\n')
    const twice = injectGitignoreBlock(once)
    assert.equal(twice, once)
    assert.equal(twice.match(/HAUS:BEGIN/g)?.length, 1)
  })

  it('never duplicates an entry the user already has verbatim outside the block', () => {
    const user = 'dist/\n.haus-workflow/context-map.json\n'
    const out = injectGitignoreBlock(user)
    // The managed block must not re-list an entry the user already has.
    const blockOnly = out.slice(out.indexOf(GITIGNORE_BEGIN), out.indexOf(GITIGNORE_END))
    assert.equal(
      (blockOnly.match(/context-map\.json/g) ?? []).length,
      0,
      'managed block must not duplicate the user-owned entry',
    )
    assert.equal((out.match(/context-map\.json/g) ?? []).length, 1, 'entry appears exactly once total')
    // The other three artifacts still need haus's own entries.
    assert.ok(blockOnly.includes('recommendation.json'))
  })

  it('never duplicates an entry already covered by a broader user directory pattern', () => {
    const user = '.haus-workflow/\n'
    const out = injectGitignoreBlock(user)
    // Every artifact is already covered by the user's own .haus-workflow/ entry —
    // haus has nothing left to add, so no managed block should be created.
    assert.equal(out.includes(GITIGNORE_BEGIN), false)
    assert.equal(out, user)
  })

  it('refreshes a stale managed block in place, keeping user content', () => {
    const stale = 'dist/\n# HAUS:BEGIN haus-managed v=1\nold-entry.json\n# HAUS:END haus-managed\n'
    const out = injectGitignoreBlock(stale)
    assert.ok(!out.includes('old-entry.json'), 'stale entry replaced')
    assert.ok(out.includes('.haus-workflow/context-map.json'))
    assert.ok(out.startsWith('dist/'), 'user content preserved')
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1)
  })

  it('strips a stale managed block once every artifact becomes covered elsewhere', () => {
    const stale =
      'dist/\n.haus-workflow/\n# HAUS:BEGIN haus-managed v=1\n.haus-workflow/context-map.json\n# HAUS:END haus-managed\n'
    const out = injectGitignoreBlock(stale)
    assert.equal(out.includes(GITIGNORE_BEGIN), false)
    assert.ok(out.includes('.haus-workflow/'), 'user directory pattern preserved')
  })

  it('repairs a malformed file with BEGIN but no END', () => {
    const broken = 'dist/\n# HAUS:BEGIN haus-managed v=1\norphan-entry.json\n'
    const out = injectGitignoreBlock(broken)
    assert.equal(out.match(/HAUS:BEGIN/g)?.length, 1)
    assert.ok(!out.includes('orphan-entry.json'))
    assert.ok(out.includes('.haus-workflow/context-map.json'))
    assert.ok(out.startsWith('dist/'))
  })
})

describe('write-gitignore: stripGitignoreBlock', () => {
  it('removes the managed block, preserving user content', () => {
    const withBlock = `dist/\n${buildGitignoreBlock()}\n`
    const out = stripGitignoreBlock(withBlock)
    assert.equal(out.includes(GITIGNORE_BEGIN), false)
    assert.ok(out.includes('dist/'))
  })

  it('is a no-op when no managed block is present', () => {
    assert.equal(stripGitignoreBlock('dist/\n'), 'dist/\n')
  })
})
