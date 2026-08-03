import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync, chmodSync } from 'node:fs'

import { writeWorkspaceClaudeMd } from '../src/claude/write-workspace-claude-md.js'

// Direct unit coverage for writeWorkspaceClaudeMd — previously untested directly
// (only referenced in a comment elsewhere) and, before this fix, shared the same
// bug as managed-write.ts: it wrote the file unconditionally in non-dry-run mode
// even when content was unchanged, despite gating its log line on content having
// changed. Fixed to match: skip the write entirely on a genuine no-op.

const OPTS = { client: 'acme', members: [{ name: 'app', path: 'app' }], collision: false }

test('creates CLAUDE.md with the workspace import block when none exists', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true })
  assert.equal(existsSync(filePath), true)
  assert.match(readFileSync(filePath, 'utf8'), /@\.haus-workflow\/cross-repo-summary\.md/)
})

test('writes the standalone WORKSPACE.md on collision instead of CLAUDE.md', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, collision: true, quiet: true })
  assert.match(filePath, /WORKSPACE\.md$/)
  assert.equal(existsSync(path.join(dir, 'CLAUDE.md')), false)
})

test('dry-run does not write to disk', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, dryRun: true, quiet: true })
  assert.equal(existsSync(filePath), false)
})

test('re-running with the same members is a no-op (mtime unchanged)', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true })
  const before = statSync(filePath).mtimeMs
  await new Promise((r) => setTimeout(r, 20))
  await writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true })
  assert.equal(statSync(filePath).mtimeMs, before, 'no-op re-run must not touch the file on disk')
})

test('a no-op re-run makes no write syscall at all (file made read-only)', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true })
  chmodSync(filePath, 0o444)
  // rmSync's t.after (registered above, runs first — node:test hooks run in
  // registration order) removes this fine even read-only; no need to chmod back.
  await assert.doesNotReject(
    writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true }),
    'a no-op re-run must never attempt to write the file, read-only or not',
  )
})

test('collision mode: a no-op re-run makes no write syscall either (file made read-only)', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, collision: true, quiet: true })
  chmodSync(filePath, 0o444)
  await assert.doesNotReject(
    writeWorkspaceClaudeMd(dir, { ...OPTS, collision: true, quiet: true }),
    'the collision-mode (WORKSPACE.md) path must also skip the write on a no-op',
  )
})

test('changing the member list updates an existing CLAUDE.md', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-workspace-md-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await writeWorkspaceClaudeMd(dir, { ...OPTS, quiet: true })
  await writeWorkspaceClaudeMd(dir, {
    ...OPTS,
    members: [...OPTS.members, { name: 'api', path: 'api' }],
    quiet: true,
  })
  assert.match(readFileSync(filePath, 'utf8'), /- api \(api\)/)
})
