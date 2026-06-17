import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { execaSync } from 'execa'

const cli = path.resolve('dist/cli.js')

// Regression: a `config` catalog item must never be written into `.claude/` or
// recorded in the lock by apply — config files are distributed via `haus scaffold`.
// Even if a config id is explicitly selected, writeClaudeFiles must skip it.
test('writeClaudeFiles skips config items: no .claude file, no lock entry', (t) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-config-skip-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const fixtureDir = path.join(temp, 'catalog')
  mkdirSync(path.join(fixtureDir, 'configs', 'eslint'), { recursive: true })
  writeFileSync(path.join(fixtureDir, 'configs', 'eslint', 'eslint.config.mjs'), 'export default []\n')
  const manifestPath = path.join(fixtureDir, 'manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: '1.0.0',
        items: [
          {
            id: 'haus.eslint-config',
            type: 'config',
            source: 'haus',
            version: '1.0.0',
            path: 'configs/eslint/eslint.config.mjs',
            title: 'Config',
            tags: [],
            repoRoles: [],
            tokenEstimate: 0,
          },
        ],
      },
      null,
      2,
    ),
  )

  const project = path.join(temp, 'project')
  mkdirSync(path.join(project, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'p', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  writeFileSync(path.join(project, 'yarn.lock'), '# lock')

  const env = { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath }
  execaSync('node', [cli, 'scan', '--json'], { cwd: project, env })

  // Call writeClaudeFiles directly with the config id explicitly selected.
  const helperPath = path.join(temp, 'run-write.mts')
  const srcPath = path.resolve('src/claude/write-claude-files.ts').replace(/\\/g, '/')
  writeFileSync(
    helperPath,
    [
      `import { writeClaudeFiles } from "${srcPath}";`,
      `await writeClaudeFiles(process.argv[2], false, JSON.parse(process.argv[3]));`,
    ].join('\n'),
  )
  execaSync('node', ['--import', 'tsx/esm', helperPath, project, JSON.stringify(['haus.eslint-config'])], {
    cwd: path.resolve('.'),
    reject: true,
    env,
  })

  const lock = JSON.parse(readFileSync(path.join(project, '.haus-workflow/haus.lock.json'), 'utf8'))
  assert.equal(lock.length, 0, 'config item must not be recorded in the lock')
  assert.equal(
    existsSync(path.join(project, '.claude/eslint.config.mjs')),
    false,
    'config item must not be written into .claude/',
  )
})
