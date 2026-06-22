/**
 * Archetype golden tests: scan + recommend against fixture repos using the
 * bundled production catalog (library/catalog/manifest.json).
 *
 * Locks stack-specific recommendations after catalog upgrade waves and asserts
 * removed Haus routers never appear in recommended[] (deleted from catalog;
 * they are not evaluated by recommend and do not appear in skipped[]).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execaSync } from 'execa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve('dist/cli.js')
const REPOS = path.resolve(__dirname, 'fixtures/repos')
const CATALOG = path.resolve('library/catalog/manifest.json')
const GOLDEN = JSON.parse(
  fs.readFileSync(new URL('./fixtures/recommend-archetypes-golden.json', import.meta.url), 'utf8'),
)

const env = {
  ...process.env,
  HAUS_FIXTURE_CATALOG: CATALOG,
}

function recommendIdsForRepo(repoRoot) {
  execaSync('node', [CLI, 'scan', '--json'], { cwd: repoRoot, env })
  execaSync('node', [CLI, 'recommend', '--json'], { cwd: repoRoot, env })
  const rec = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  return {
    recommended: new Set(rec.recommended.map((x) => x.id)),
    skipped: new Set(rec.skipped.map((x) => x.id)),
  }
}

function withFixtureCopy(fixtureName, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-arch-${fixtureName}-`))
  fs.cpSync(path.join(REPOS, fixtureName), tmp, { recursive: true })
  try {
    return fn(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function withStripeSupabaseFixture(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-arch-stripe-supabase-'))
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify(
      {
        name: 'stripe-supabase-fixture',
        packageManager: 'yarn@4.5.3',
        dependencies: {
          next: '15.0.0',
          react: '19.0.0',
          '@stripe/stripe-js': '4.0.0',
          '@supabase/supabase-js': '2.0.0',
        },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(tmp, 'yarn.lock'), '# fixture lockfile\n')
  try {
    return fn(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

for (const [fixture, spec] of Object.entries(GOLDEN.profiles)) {
  test(`recommend archetype: ${fixture}`, () => {
    const run =
      fixture === 'stripe-supabase-app'
        ? withStripeSupabaseFixture
        : (fn) => withFixtureCopy(fixture, fn)

    run((root) => {
      const { recommended, skipped } = recommendIdsForRepo(root)

      for (const id of spec.mustInclude) {
        assert.ok(recommended.has(id), `${fixture}: expected recommended ${id}`)
      }

      for (const id of spec.mustNotInclude ?? []) {
        assert.ok(!recommended.has(id), `${fixture}: must not recommend ${id}`)
      }

      for (const id of GOLDEN.removedMustNotRecommend) {
        assert.ok(!recommended.has(id), `${fixture}: removed ${id} must not be recommended`)
        assert.ok(!skipped.has(id), `${fixture}: removed ${id} must not appear in skipped`)
      }
    })
  })
}
