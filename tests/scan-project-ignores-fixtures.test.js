import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanProject } from '../src/scanner/scan-project.ts'

// Regression: scanning a repo that ships its own test fixtures (e.g. haus-workflow
// itself) must not treat tests/fixtures/** content as real project signals. Before the
// fix, unanchored SAFE_FILES globs like '**/*.sln' and '**/vendure-config.*' matched
// fixture files and produced false roles/stacks (dotnet-service, vendure3, ...).

test('scanProject ignores tests/fixtures content when detecting roles and stacks', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-scan-fixtures-guard-'))
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'plain-ts-cli', dependencies: { typescript: '^5.0.0' } }),
  )
  fs.mkdirSync(path.join(tmp, 'tests', 'fixtures', 'dotnet-service'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'tests', 'fixtures', 'dotnet-service', 'App.sln'), '')
  fs.mkdirSync(path.join(tmp, 'tests', 'fixtures', 'vendure-plugin'), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, 'tests', 'fixtures', 'vendure-plugin', 'package.json'),
    JSON.stringify({ name: 'fixture-plugin', dependencies: { '@vendure/core': '^3.0.0' } }),
  )

  const result = await scanProject(tmp)

  assert.ok(
    !result.repoRoles.includes('dotnet-service'),
    'fixture .sln must not set dotnet-service role',
  )
  assert.ok(
    !result.repoRoles.includes('vendure-plugin'),
    'fixture package.json must not set vendure-plugin role',
  )
  assert.ok(!result.detectedStacks.backend.includes('dotnet'), 'fixture must not leak dotnet stack')
  assert.ok(
    !result.detectedStacks.backend.includes('vendure3'),
    'fixture must not leak vendure3 stack',
  )

  fs.rmSync(tmp, { recursive: true, force: true })
})
