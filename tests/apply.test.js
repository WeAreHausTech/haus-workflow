import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execaSync } from 'execa'

process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

test('generated settings uses haus command', () => {
  const combined = [
    fs.readFileSync('src/claude/write-claude-files.ts', 'utf8'),
    fs.readFileSync('src/claude/load-hooks.ts', 'utf8'),
  ].join('\n')
  assert.equal(/haus-ai\s+(doctor|context|guard|apply)/.test(combined), false)
  assert.equal(combined.includes('haus context --from-hook'), true)
})

test('apply writes claude files and rules', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'apply-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  const env = {
    ...process.env,
    HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
  }
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp, env })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })

  const settings = JSON.parse(readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))
  const rulesHaus = readFileSync(path.join(temp, '.claude/rules/haus.md'), 'utf8')
  const rulesSecurity = readFileSync(path.join(temp, '.claude/rules/security.md'), 'utf8')

  const ups = settings.hooks.UserPromptSubmit[0].hooks
  assert.equal(ups.length, 1)
  assert.equal(ups[0].command, 'haus context --from-hook')
  const pre = settings.hooks.PreToolUse
  assert.equal(pre[0].matcher, 'Read|Edit|Write')
  assert.equal(pre[0].hooks[0].command, 'haus guard file-access --from-hook')
  assert.equal(pre[1].matcher, 'Bash')
  assert.equal(pre[1].hooks[0].command, 'haus guard bash --from-hook')
  // Deterministic deny rules are written into project settings.json (WS1).
  assert.equal(Array.isArray(settings.permissions?.deny), true)
  assert.equal(settings.permissions.deny.includes('Bash(rm -rf:*)'), true)
  assert.equal(rulesHaus.includes('Keep context minimal'), true)
  // WS6: managed rule carries the natural-language "Driving haus" trigger.
  assert.equal(rulesHaus.includes('Driving haus'), true)
  assert.equal(rulesHaus.includes('haus setup-project'), true)
  assert.equal(rulesSecurity.includes('Never read secrets'), true)

  const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
  assert.equal(Array.isArray(lock), true)
  assert.equal(lock.length > 0, true)
  for (const row of lock) {
    assert.equal(row.version, pkg.version)
    assert.equal(row.hash.startsWith('sha256-'), true)
  }
})

test('apply merges haus hooks into existing settings without clobbering user hooks', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-merge-settings-'))
  mkdirSync(path.join(temp, '.claude'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'apply-merge', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  writeFileSync(
    path.join(temp, '.claude/settings.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Custom',
              hooks: [{ type: 'command', command: 'echo user-hook' }],
            },
          ],
        },
        permissions: { ask: ['Bash(custom:*)'] },
      },
      null,
      2,
    ) + '\n',
  )

  const env = {
    ...process.env,
    HAUS_FIXTURE_CATALOG: path.resolve('tests/fixtures/catalog/manifest.json'),
  }
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp, env })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })

  const settings = JSON.parse(readFileSync(path.join(temp, '.claude/settings.json'), 'utf8'))
  const pre = settings.hooks.PreToolUse
  assert.equal(
    pre.some((e) => e.matcher === 'Custom'),
    true,
  )
  assert.equal(
    pre.some((e) => e.matcher === 'Read|Edit|Write'),
    true,
  )
  assert.equal(settings.permissions.ask.includes('Bash(custom:*)'), true)
  assert.equal(settings.permissions.deny.includes('Bash(rm -rf:*)'), true)
})

test('apply --write warns and succeeds when catalog cache is empty', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-empty-cache-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      {
        name: 'apply-empty-cache',
        packageManager: 'yarn@4.5.3',
        dependencies: { react: '19.0.0' },
      },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const env = {
    ...process.env,
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'empty-cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
  // execa extends process.env by default — clear fixture override so cache-empty gate runs.
  env.HAUS_FIXTURE_CATALOG = ''
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp, env })
  const r = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(r.exitCode, 0)
  const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.equal(combined.includes('Catalog cache is empty'), true)
  assert.equal(fs.existsSync(path.join(temp, '.claude/settings.json')), true)
})

test('apply reports diff before overwriting generated files', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-overwrite-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'apply-overwrite', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })
  const manualPath = path.join(temp, '.claude/rules/security.md')
  writeFileSync(manualPath, 'manual override')
  const second = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(second.exitCode, 0)
  assert.equal(second.stdout.includes('Overwriting ./.claude/rules/security.md'), true)
})

test('apply --dry-run shows diffs and does not write files', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-dry-run-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'dry-run-test', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  const result = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--dry-run'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout.includes('Dry-run complete'), true)
  assert.equal(result.stdout.includes('none written'), true)
  // Dry-run output should include the haus-imports block being created
  assert.equal(result.stdout.includes('HAUS:BEGIN haus-imports'), true)
  // Root CLAUDE.md and .claude/CLAUDE.md should not be written in dry-run
  assert.equal(fs.existsSync(path.join(temp, 'CLAUDE.md')), false)
  assert.equal(fs.existsSync(path.join(temp, '.claude', 'CLAUDE.md')), false)
})
