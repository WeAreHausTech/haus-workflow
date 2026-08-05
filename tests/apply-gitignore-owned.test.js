import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execaSync } from 'execa'

// Task 1.3 (D5) in docs/plans/workspace-detection-and-permissions-fixes.md: `haus
// apply --write` must warn, once, at the end of its final summary, when the user's
// OWN `.claude/`/`.haus-workflow/` (tracked, catalog-managed content) is accidentally
// gitignored — the reporter's actual failure mode: 80 skills written, invisible.

const cli = path.resolve('dist/cli.js')

function git(cwd, args) {
  return execaSync('git', args, { cwd })
}

function makeProject(prefix) {
  const temp = mkdtempSync(path.join(os.tmpdir(), `haus-${prefix}-`))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: prefix, packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  git(temp, ['init', '-q'])
  git(temp, ['config', 'user.email', 'test@example.com'])
  git(temp, ['config', 'user.name', 'test'])
  return temp
}

const env = {
  ...process.env,
  HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
}

test('apply --write warns once at the end when .claude/ is gitignored', (t) => {
  const temp = makeProject('gi-owned-claude')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  // A broad rule meant only to keep per-developer settings out of git, but written
  // too broadly — this is the reporter's actual failure mode.
  writeFileSync(path.join(temp, '.gitignore'), '.claude/\n')

  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  const result = execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env, reject: false })
  const out = (result.stdout ?? '') + (result.stderr ?? '')

  assert.match(out, /\.claude\/ is gitignored/)
  assert.match(out, /(invisible|will not be visible)/)
})

test('apply --write does not warn following the documented gitignore pattern', (t) => {
  const temp = makeProject('gi-owned-clean')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  // Mirrors this repo's own .gitignore: only per-developer settings/worktrees ignored.
  writeFileSync(
    path.join(temp, '.gitignore'),
    ['.claude/settings.json', '.claude/settings.local.json', '.claude/worktrees/', ''].join('\n'),
  )

  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  const result = execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env, reject: false })
  const out = (result.stdout ?? '') + (result.stderr ?? '')

  assert.doesNotMatch(out, /is gitignored/)
  assert.doesNotMatch(out, /are gitignored/)
})
