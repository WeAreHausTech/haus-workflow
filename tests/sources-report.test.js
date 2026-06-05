import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildSourcesReport } from '../src/scanner/write-sources-report.js'
import { writeSourcesReport } from '../src/scanner/write-sources-report.js'

const FIXTURE = path.resolve('tests/fixtures/catalog/manifest.json')

test('buildSourcesReport approves curated when reviewStatus is approved', () => {
  const report = buildSourcesReport([
    {
      id: 'x',
      source: 'curated',
      type: 'skill',
      path: 'skills/x',
      tags: [],
      repoRoles: [],
      reviewStatus: 'approved',
      tokenEstimate: 1,
    },
  ])
  assert.deepEqual(report.items, [{ id: 'curated', status: 'approved' }])
})

test('writeSourcesReport writes sources-report.json from catalog sources', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'haus-sources-'))
  mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
  process.env.HAUS_FIXTURE_CATALOG = FIXTURE
  try {
    const report = await writeSourcesReport(tmpDir)
    assert.equal(Array.isArray(report.items), true)
    const written = JSON.parse(
      readFileSync(path.join(tmpDir, '.haus-workflow/sources-report.json'), 'utf8'),
    )
    assert.equal(Array.isArray(written.items), true)
  } finally {
    delete process.env.HAUS_FIXTURE_CATALOG
    rmSync(tmpDir, { recursive: true, force: true })
  }
})
