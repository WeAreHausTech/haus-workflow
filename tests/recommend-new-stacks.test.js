/**
 * Regression: v3.5.0 catalog items are recommended for newly-covered stacks.
 * Minimal package.json fixtures + bundled production catalog.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

const CLI = path.resolve('dist/cli.js')
const CATALOG = path.resolve('library/catalog/manifest.json')
const GOLDEN = JSON.parse(
  fs.readFileSync(new URL('./fixtures/recommend-new-stacks-golden.json', import.meta.url), 'utf8'),
)

const env = {
  ...process.env,
  HAUS_FIXTURE_CATALOG: CATALOG,
  HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(os.tmpdir(), `haus-new-stacks-cache-${process.pid}`),
}

function recommendIds(root) {
  execaSync('node', [CLI, 'scan', '--json'], { cwd: root, env })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: root, env })
  const rec = JSON.parse(
    fs.readFileSync(path.join(root, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  return new Set(rec.recommended.map((x) => x.id))
}

function withPackageJson(packageJson, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-new-stack-'))
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(packageJson, null, 2))
  fs.writeFileSync(path.join(tmp, 'yarn.lock'), '# fixture lockfile\n')
  try {
    return fn(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

for (const [name, spec] of Object.entries(GOLDEN.profiles)) {
  test(`recommend new stack: ${name}`, () => {
    withPackageJson(spec.packageJson, (root) => {
      const recommended = recommendIds(root)
      for (const id of spec.mustInclude) {
        assert.ok(recommended.has(id), `${name}: expected recommended ${id}`)
      }
      for (const id of spec.mustNotInclude ?? []) {
        assert.ok(!recommended.has(id), `${name}: must not recommend ${id}`)
      }
    })
  })
}
