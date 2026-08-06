import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { scanProject } from '../src/scanner/scan-project.ts'

// Materialization plan Task 2, defense-in-depth: even if context-map.json leaks into
// git again (stale commit, misconfigured gitignore, a fork that skipped `haus apply`),
// it must never carry a machine-local absolute path like `/Users/<name>/...` or
// `/home/<name>/...`. See ADR-0025 — the ContextMap type has no `root` (or any other
// absolute-path) field at all going forward.

test('scanProject: in-memory result has no absolute-path field', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-scan-no-abs-path-'))
  try {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'no-abs-path-check', dependencies: { react: '19.0.0' } }),
    )
    const result = await scanProject(tmp)
    assert.equal('root' in result, false, 'ContextMap must not carry a root field')
    const serialized = JSON.stringify(result)
    assert.doesNotMatch(
      serialized,
      /"\/(Users|home)\//,
      'no absolute user path anywhere in the scan result',
    )
    // Belt-and-suspenders: the temp dir path itself (which lives under the platform
    // tmp dir, not necessarily /Users or /home) must also not appear verbatim.
    assert.equal(
      serialized.includes(tmp),
      false,
      'scan result must not embed the scanned root path',
    )
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('context-map.json written to disk has no absolute-path field', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-scan-no-abs-path-file-'))
  try {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'no-abs-path-file-check', dependencies: { react: '19.0.0' } }),
    )
    await scanProject(tmp)
    const written = fs.readFileSync(path.join(tmp, '.haus-workflow/context-map.json'), 'utf8')
    assert.doesNotMatch(written, /"root"\s*:/, 'context-map.json must not serialize a root field')
    assert.doesNotMatch(written, /"\/(Users|home)\//, 'no absolute user path in the written file')
    assert.equal(written.includes(tmp), false, 'written file must not embed the scanned root path')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
