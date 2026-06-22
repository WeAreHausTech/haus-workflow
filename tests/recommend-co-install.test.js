/**
 * Co-install suppression rules (recommend post-pass).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

const CATALOG = path.resolve('library/catalog/manifest.json')
const CLI = path.resolve('dist/cli.js')
const env = { ...process.env, HAUS_FIXTURE_CATALOG: CATALOG }

function withTempRepo(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-co-install-'))
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

function scanAndRecommend(root) {
  execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: root, env })
  return JSON.parse(fs.readFileSync(path.join(root, '.haus-workflow/recommendation.json'), 'utf8'))
}

function recommendAfterScan(root) {
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: root, env })
  return JSON.parse(fs.readFileSync(path.join(root, '.haus-workflow/recommendation.json'), 'utf8'))
}

const recommendedIds = (result) => new Set(result.recommended.map((x) => x.id))
const skippedIds = (result) => new Set(result.skipped.map((x) => x.id))

test('co-install: oh-my test-engineer skipped when e2e-testing present', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        {
          name: 'playwright-next',
          packageManager: 'yarn@4.5.3',
          dependencies: {
            next: '15.0.0',
            react: '19.0.0',
            '@playwright/test': '1.49.0',
          },
        },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      const result = await scanAndRecommend(root)
      const ids = recommendedIds(result)
      assert.ok(ids.has('haus.ecc-e2e-testing') || ids.has('haus.ecc-e2e-runner'))
      assert.ok(!ids.has('haus.oh-my-claudecode-test-engineer'))
      assert.ok(skippedIds(result).has('haus.oh-my-claudecode-test-engineer'))
    },
  )
})

test('co-install: specifying-gates skipped when checking-gates baseline present', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        { name: 'minimal', packageManager: 'yarn@4.5.3', dependencies: {} },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
      fs.writeFileSync(
        path.join(root, '.haus-workflow/deep-context.json'),
        JSON.stringify({ roles: ['user-gate'] }),
      )
      const result = recommendAfterScan(root)
      assert.ok(recommendedIds(result).has('haus.superpowers-checking-gates'))
      assert.ok(!recommendedIds(result).has('haus.superpowers-specifying-gates'))
      assert.ok(skippedIds(result).has('haus.superpowers-specifying-gates'))
    },
  )
})

test('co-install: security-reviewer skipped without security-review role', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        {
          name: 'nestjs-api',
          packageManager: 'yarn@4.5.3',
          dependencies: { '@nestjs/core': '10.0.0', '@nestjs/graphql': '12.0.0' },
        },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      const result = await scanAndRecommend(root)
      assert.ok(!recommendedIds(result).has('haus.ecc-security-reviewer'))
    },
  )
})

test('co-install: security-reviewer eligible with deep security-review role', async () => {
  await withTempRepo(
    {
      'package.json': JSON.stringify(
        {
          name: 'nestjs-api',
          packageManager: 'yarn@4.5.3',
          dependencies: { '@nestjs/core': '10.0.0' },
        },
        null,
        2,
      ),
      'yarn.lock': '# fixture\n',
    },
    async (root) => {
      execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
      fs.writeFileSync(
        path.join(root, '.haus-workflow/deep-context.json'),
        JSON.stringify({ roles: ['security-review'] }),
      )
      const result = recommendAfterScan(root)
      assert.ok(recommendedIds(result).has('haus.ecc-security-reviewer'))
    },
  )
})
