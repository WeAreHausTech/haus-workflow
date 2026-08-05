/**
 * Direct unit coverage for the three audits mirrored from
 * haus-workflow-catalog/scripts/validate-core.mjs into this CLI's own ingest-time
 * validator (audit §E2/§E1 — Combined/seam section). Before this file, these three
 * audits were untested here (they only ran indirectly through the CLI-level
 * `validate-catalog CLI validates bundled fixture manifest` happy-path test).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'

import { auditSafetyNotes, auditIntents, auditDiskOrphans } from '../src/catalog/validate-core.ts'

function tempManifestDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'haus-validate-core-audits-'))
}

// --- auditSafetyNotes ---

test('auditSafetyNotes: flags a tagged item with no safetyNotes', () => {
  const failures = auditSafetyNotes([{ id: 'x', tags: ['stripe'], safetyNotes: [] }])
  assert.deepEqual(failures, ['x: auth/payments item missing non-empty safetyNotes'])
})

test('auditSafetyNotes: flags a tagged item with safetyNotes entirely absent', () => {
  const failures = auditSafetyNotes([{ id: 'x', tags: ['bankid'] }])
  assert.deepEqual(failures, ['x: auth/payments item missing non-empty safetyNotes'])
})

test('auditSafetyNotes: passes a tagged item with non-empty safetyNotes', () => {
  const failures = auditSafetyNotes([
    { id: 'x', tags: ['qliro'], safetyNotes: ['never expose the merchant key client-side'] },
  ])
  assert.deepEqual(failures, [])
})

test('auditSafetyNotes: does not flag an item with no sensitive tag', () => {
  const failures = auditSafetyNotes([{ id: 'x', tags: ['react', 'security'] }])
  assert.deepEqual(failures, [])
})

test('auditSafetyNotes: tag match is case-insensitive', () => {
  const failures = auditSafetyNotes([{ id: 'x', tags: ['Stripe'] }])
  assert.deepEqual(failures, ['x: auth/payments item missing non-empty safetyNotes'])
})

// --- auditIntents ---

test('auditIntents: flags a tagged item with no intents', () => {
  const failures = auditIntents([{ id: 'x', tags: ['oidc'], intents: [] }])
  assert.deepEqual(failures, ['x: auth/payments item missing non-empty intents'])
})

test('auditIntents: passes a tagged item with non-empty intents', () => {
  const failures = auditIntents([{ id: 'x', tags: ['saml2'], intents: ['configure SSO'] }])
  assert.deepEqual(failures, [])
})

test('auditIntents: does not flag an item with no sensitive tag', () => {
  const failures = auditIntents([{ id: 'x', tags: ['react'] }])
  assert.deepEqual(failures, [])
})

// --- auditDiskOrphans ---

test('auditDiskOrphans: flags a file on disk claimed by no manifest item', () => {
  const root = tempManifestDir()
  try {
    mkdirSync(path.join(root, 'skills', 'orphan-skill'), { recursive: true })
    writeFileSync(path.join(root, 'skills', 'orphan-skill', 'SKILL.md'), '# orphan\n')
    const failures = auditDiskOrphans(root, [])
    assert.deepEqual(failures, [
      'orphaned on disk, claimed by no manifest item: skills/orphan-skill/SKILL.md',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('auditDiskOrphans: does not flag a file claimed by a manifest item path', () => {
  const root = tempManifestDir()
  try {
    mkdirSync(path.join(root, 'skills', 'claimed-skill'), { recursive: true })
    writeFileSync(path.join(root, 'skills', 'claimed-skill', 'SKILL.md'), '# claimed\n')
    const failures = auditDiskOrphans(root, [
      { id: 'x', path: 'skills/claimed-skill', type: 'skill' },
    ])
    assert.deepEqual(failures, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('auditDiskOrphans: exempts the documented superpowers/shared prefix', () => {
  const root = tempManifestDir()
  try {
    mkdirSync(path.join(root, 'skills', 'superpowers', 'shared'), { recursive: true })
    writeFileSync(path.join(root, 'skills', 'superpowers', 'shared', 'note.md'), '# shared\n')
    const failures = auditDiskOrphans(root, [])
    assert.deepEqual(failures, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('auditDiskOrphans: content root absent on disk is not an error', () => {
  const root = tempManifestDir()
  try {
    const failures = auditDiskOrphans(root, [])
    assert.deepEqual(failures, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('auditDiskOrphans: an unreadable subtree is reported as a failure, not thrown', () => {
  if (process.getuid && process.getuid() === 0) return // root bypasses permission bits
  const root = tempManifestDir()
  const unreadableDir = path.join(root, 'skills', 'unreadable-dir')
  mkdirSync(unreadableDir, { recursive: true })
  try {
    chmodSync(unreadableDir, 0o000)
    const failures = auditDiskOrphans(root, [])
    assert.ok(
      failures.some((f) => f.includes(unreadableDir) && f.includes('unreadable subtree')),
      `expected an "unreadable subtree" failure, got: ${JSON.stringify(failures)}`,
    )
  } finally {
    chmodSync(unreadableDir, 0o755)
    rmSync(root, { recursive: true, force: true })
  }
})
