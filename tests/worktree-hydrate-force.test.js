// tests/worktree-hydrate-force.test.js
//
// Unit coverage for hydrateMember()'s --force re-clone path — plain temp dirs, no
// git fixture needed (hydrateMember only touches HYDRATION_TARGETS dirs + runs
// install-reconciliation, which no-ops when no lockfile is present).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { detectCowStrategy } from '../src/workspace/worktree/cow-copy.ts'
import { hydrateMember } from '../src/workspace/worktree/hydrate.ts'

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('hydrateMember --force replaces an existing destination target, never nests a stale copy inside itself', async (t) => {
  // Same CoW-unsupported-filesystem guard as tests/worktree-add.test.js — on an
  // unsupported filesystem (e.g. ext4 on typical CI Linux runners), cowCopyDir()
  // skips the copy attempt entirely by design, so there's no fresh content to
  // assert on here at all (the destination stays empty after --force's cleanup).
  const strategy = await detectCowStrategy(os.tmpdir())
  if (strategy === 'unsupported' || strategy === 'unknown-platform') {
    t.skip(
      `CoW unsupported on this filesystem (${strategy}) — cowCopyDir() skips the copy entirely by design`,
    )
    return
  }

  const main = tmpDir('haus-hydrate-force-main-')
  const worktree = tmpDir('haus-hydrate-force-wt-')
  try {
    // Main checkout's node_modules — the source that gets (re-)cloned.
    fs.mkdirSync(path.join(main, 'node_modules', 'dep'), { recursive: true })
    fs.writeFileSync(path.join(main, 'node_modules', 'dep', 'pkg.txt'), 'fresh-content')

    // Worktree already has a STALE node_modules from a previous hydrate.
    fs.mkdirSync(path.join(worktree, 'node_modules', 'dep'), { recursive: true })
    fs.writeFileSync(path.join(worktree, 'node_modules', 'dep', 'pkg.txt'), 'stale-content')

    await hydrateMember(main, worktree, { force: true })

    const destNodeModules = path.join(worktree, 'node_modules')
    // Must NOT have nested (cp copying into an existing dir): no node_modules/node_modules.
    assert.equal(
      fs.existsSync(path.join(destNodeModules, 'node_modules')),
      false,
      '--force must not nest a stale copy inside itself',
    )
    // The destination must reflect the fresh source content, not the stale one.
    const content = fs.readFileSync(path.join(destNodeModules, 'dep', 'pkg.txt'), 'utf8')
    assert.equal(
      content,
      'fresh-content',
      '--force must replace stale content with the fresh source',
    )
  } finally {
    fs.rmSync(main, { recursive: true, force: true })
    fs.rmSync(worktree, { recursive: true, force: true })
  }
})

test('hydrateMember without --force leaves an existing destination target untouched', async () => {
  const main = tmpDir('haus-hydrate-noforce-main-')
  const worktree = tmpDir('haus-hydrate-noforce-wt-')
  try {
    fs.mkdirSync(path.join(main, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(main, 'node_modules', 'fresh.txt'), 'fresh')

    fs.mkdirSync(path.join(worktree, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(worktree, 'node_modules', 'existing.txt'), 'already here')

    await hydrateMember(main, worktree, { force: false })

    // Untouched — the pre-existing file survives, the fresh one from main never got copied.
    assert.ok(fs.existsSync(path.join(worktree, 'node_modules', 'existing.txt')))
    assert.equal(fs.existsSync(path.join(worktree, 'node_modules', 'fresh.txt')), false)
  } finally {
    fs.rmSync(main, { recursive: true, force: true })
    fs.rmSync(worktree, { recursive: true, force: true })
  }
})
