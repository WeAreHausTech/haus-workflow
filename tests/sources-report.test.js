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
  assert.deepEqual(report.items, [{ source: 'curated', status: 'approved' }])
})

test('buildSourcesReport entries use field name "source" not "id"', () => {
  const report = buildSourcesReport([
    {
      id: 'y',
      source: 'curated',
      type: 'skill',
      path: 'skills/y',
      tags: [],
      repoRoles: [],
      reviewStatus: 'approved',
      tokenEstimate: 1,
    },
  ])
  assert.equal(report.items.length, 1)
  const entry = report.items[0]
  // The serialised entry must have the key "source", not "id".
  assert.ok('source' in entry, 'entry must have a "source" field')
  assert.ok(!('id' in entry), 'entry must NOT have an "id" field — use "source" to prevent naming landmine')
  assert.equal(entry.source, 'curated')
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
