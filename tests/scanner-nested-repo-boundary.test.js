import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { scanProject } from '../src/scanner/scan-project.ts'
import { listFiles } from '../src/utils/fs.ts'

// Regression for D9 (docs/plans/workspace-detection-and-permissions-fixes.md, Task 1.1):
// a meta-repo scan must not leak a sibling repo's stack signals as its own. Before the
// fix, listFiles()'s SAFE_FILES glob had no nested-.git awareness, so a sibling repo's
// schema.graphql under the scan root was picked up and misdetected as the meta-repo's
// own graphql/backend stack.

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
}

test('meta-repo scan excludes a nested sibling repo (own .git dir) from detection', async () => {
  const meta = tmpDir('haus-meta-repo-')
  try {
    initRepo(meta) // meta/ has its own .git, no manifest of its own

    const sibling = path.join(meta, 'sibling-repo')
    initRepo(sibling) // independent nested .git — a real sibling repo
    fs.mkdirSync(path.join(sibling, 'schema'), { recursive: true })
    fs.writeFileSync(path.join(sibling, 'schema', 'sibling.graphql'), 'type Query { ok: Boolean }')
    fs.writeFileSync(path.join(sibling, 'schema.graphql'), 'type Query { ok: Boolean }')

    const result = await scanProject(meta)

    assert.deepEqual(result.detectedStacks.backend, [], 'sibling graphql stack must not leak')
    assert.deepEqual(result.detectedStacks, {
      backend: [],
      frontend: [],
      databases: [],
      testing: [],
      auth: [],
      // missing-prettier/missing-eslint are weak signals (no package.json at all in
      // meta/) — they don't count toward detectionStatus (see WEAK_STACK_SIGNALS in
      // src/scanner/detection.ts), so 'unknown' below still holds.
      tooling: ['missing-prettier', 'missing-eslint'],
      packageManagers: [],
    })
    assert.equal(result.detectionStatus, 'unknown')
    assert.deepEqual(result.repoRoles, [])
  } finally {
    fs.rmSync(meta, { recursive: true, force: true })
  }
})

test('a linked-worktree-style nested .git (file, not dir) is excluded the same way', async () => {
  const meta = tmpDir('haus-meta-repo-worktree-')
  try {
    initRepo(meta)

    // Simulate a linked worktree: a `.git` *file* (not directory) at the nested root.
    const sibling = path.join(meta, 'sibling-worktree')
    fs.mkdirSync(sibling, { recursive: true })
    fs.writeFileSync(path.join(sibling, '.git'), 'gitdir: /somewhere/.git/worktrees/sibling-worktree\n')
    fs.writeFileSync(path.join(sibling, 'schema.graphql'), 'type Query { ok: Boolean }')

    const files = await listFiles(meta, ['**/*.graphql'])

    assert.deepEqual(files, [], 'files under a .git-file (worktree) sibling must be excluded')
  } finally {
    fs.rmSync(meta, { recursive: true, force: true })
  }
})

test('monorepo regression: nested package.json WITHOUT its own .git still scans normally', async () => {
  // Same shape the plan calls out as a false-positive risk: a monorepo with multiple
  // package.json below a single root .git must be unaffected by the nested-repo boundary.
  const root = tmpDir('haus-monorepo-regression-')
  try {
    initRepo(root)
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'monorepo-root',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { '@nestjs/core': '11.0.0', graphql: '16.9.0' },
      }),
    )
    fs.writeFileSync(path.join(root, 'schema.graphql'), 'type Query { ok: Boolean }')
    fs.mkdirSync(path.join(root, 'packages', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'packages', 'api', 'package.json'),
      JSON.stringify({ name: 'api', dependencies: { express: '^4.0.0' } }),
    )

    const result = await scanProject(root)

    // No nested .git anywhere below root — nothing should be pruned. The root's own
    // real stack signals (graphql) still detect normally.
    assert.ok(result.detectedStacks.backend.includes('graphql'), 'root graphql stack still detects')
    assert.equal(result.detectionStatus, 'supported')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
