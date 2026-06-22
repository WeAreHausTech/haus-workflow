/**
 * Regression tests for P2g requiresAny / co-install gate fixes.
 * Uses bundled production catalog via HAUS_FIXTURE_CATALOG (subprocess env).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execaSync } from 'execa'

const CATALOG = path.resolve('library/catalog/manifest.json')
const CLI = path.resolve('dist/cli.js')
const REPOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/repos')

const env = { ...process.env, HAUS_FIXTURE_CATALOG: CATALOG }

function recommendIds(root) {
  execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: root, env })
  const rec = JSON.parse(
    fs.readFileSync(path.join(root, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  return new Set(rec.recommended.map((x) => x.id))
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

function withFixtureCopy(fixtureName, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-gate-${fixtureName}-`))
  fs.cpSync(path.join(REPOS, fixtureName), tmp, { recursive: true })
  try {
    return fn(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

test('tanstack virtual-only: must not recommend tanstack-query-router-patterns', () => {
  withTempRepo(
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
    (root) => {
      const ids = recommendIds(root)
      assert.ok(!ids.has('haus.tanstack-query-router-patterns'))
    },
  )
})

test('laravel without sentry: must not recommend sentry-php-sdk', () => {
  withTempRepo(
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
    (root) => {
      const ids = recommendIds(root)
      assert.ok(!ids.has('haus.sentry-sentry-php-sdk'))
    },
  )
})

test('nx eslint-plugin only: must not recommend nx21-monorepo-patterns', () => {
  withTempRepo(
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
    (root) => {
      const ids = recommendIds(root)
      assert.ok(!ids.has('haus.nx21-monorepo-patterns'))
    },
  )
})

test('nextjs archetype: must not recommend typescript-reviewer', () => {
  withFixtureCopy('nextjs-app', (root) => {
    const ids = recommendIds(root)
    assert.ok(ids.has('haus.ecc-react-reviewer'))
    assert.ok(!ids.has('haus.ecc-typescript-reviewer'))
  })
})
