/**
 * Regression tests for P2g requiresAny / co-install gate fixes.
 * Uses bundled production catalog via HAUS_FIXTURE_CATALOG.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

import { recommend } from '../src/recommender/recommend.js'

const CATALOG = path.resolve('library/catalog/manifest.json')
const CLI = path.resolve('dist/cli.js')

const env = { ...process.env, HAUS_FIXTURE_CATALOG: CATALOG }

function makeContext(root, overrides = {}) {
  return {
    mode: 'guided',
    generatedAt: new Date().toISOString(),
    root,
    repoName: 'test-repo',
    packageManager: 'yarn',
    repoRoles: [],
    detectedStacks: {},
    dependencies: [],
    securityRisks: [],
    crossRepoHints: [],
    warnings: [],
    detectionStatus: 'supported',
    unsupportedSignals: [],
    ...overrides,
  }
}

function withTempRepo(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-gate-regression-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmp, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  try {
    return fn(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

test('tanstack virtual-only: must not recommend tanstack-query-router-patterns', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        {
          name: 'tanstack-virtual-only',
          packageManager: 'yarn@4.5.3',
          dependencies: {
            next: '15.0.0',
            react: '19.0.0',
            '@tanstack/react-virtual': '3.0.0',
          },
        },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
      const result = await recommend(root, makeContext(root))
      const ids = new Set(result.recommended.map((x) => x.id))
      assert.ok(!ids.has('haus.tanstack-query-router-patterns'))
    },
  )
})

test('laravel without sentry: must not recommend sentry-php-sdk', async () => {
  await withTempRepo(
    {
      'composer.json': JSON.stringify(
        {
          name: 'haus/laravel-no-sentry',
          require: { 'laravel/framework': '^11.0' },
        },
        null,
        2,
      ),
      artisan: '#!/usr/bin/env php\n',
    },
    async (root) => {
      execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
      const result = await recommend(root, makeContext(root))
      const ids = new Set(result.recommended.map((x) => x.id))
      assert.ok(!ids.has('haus.sentry-sentry-php-sdk'))
    },
  )
})

test('nx eslint-plugin only: must not recommend nx21-monorepo-patterns', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        {
          name: 'nx-eslint-only',
          packageManager: 'yarn@4.5.3',
          devDependencies: { '@nx/eslint-plugin': '21.0.0' },
        },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
      const result = await recommend(root, makeContext(root))
      const ids = new Set(result.recommended.map((x) => x.id))
      assert.ok(!ids.has('haus.nx21-monorepo-patterns'))
    },
  )
})
