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
  assert.equal(combined.includes('haus guard file-access --from-hook'), true)
  assert.equal(combined.includes('haus context --from-hook'), false)
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

  assert.equal(settings.hooks.UserPromptSubmit, undefined)
  const pre = settings.hooks.PreToolUse
  assert.equal(pre[0].matcher, 'Read|Edit|Write')
  assert.equal(pre[0].hooks[0].command, 'haus guard file-access --from-hook')
  assert.equal(pre[1].matcher, 'Bash')
  assert.equal(pre[1].hooks[0].command, 'haus guard bash --from-hook')
  // Deterministic deny rules are written into project settings.json (WS1).
  assert.equal(Array.isArray(settings.permissions?.deny), true)
  assert.equal(settings.permissions.deny.includes('Bash(sudo:*)'), true)
  assert.equal(rulesHaus.includes('Keep context minimal'), true)
  // WS6: managed rule carries the natural-language "Driving haus" trigger.
  assert.equal(rulesHaus.includes('Driving haus'), true)
  assert.equal(rulesHaus.includes('haus setup-project'), true)
  // Security lines folded into haus.md; no standalone security.md is written.
  assert.equal(rulesHaus.includes('Never read secrets'), true)
  assert.equal(fs.existsSync(path.join(temp, '.claude/rules/security.md')), false)

  const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
  assert.equal(Array.isArray(lock), true)
  assert.equal(lock.length > 0, true)
  for (const row of lock) {
    assert.equal(row.version, pkg.version)
    assert.equal(row.hash.startsWith('sha256-'), true)
  }
  assert.equal(fs.existsSync(path.join(temp, '.haus-workflow/config.json')), false)
})

test('apply writes guards-only hook contract and doctor --hooks passes', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-hooks-contract-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'hooks-contract', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
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
  assert.equal(settings.hooks.UserPromptSubmit, undefined)
  assert.equal(settings.hooks.PreToolUse.length, 2)

  const doctor = execaSync('node', [path.resolve('dist/cli.js'), 'doctor', '--hooks'], {
    cwd: temp,
    env,
    reject: false,
  })
  assert.equal(doctor.exitCode, 0, doctor.stderr)
  assert.match(doctor.stdout, /hook contract/i)
})

test('apply upgrades legacy settings by pruning the retired context UserPromptSubmit hook', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-apply-upgrade-context-hook-'))
  mkdirSync(path.join(temp, '.claude'), { recursive: true })
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'apply-upgrade', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  writeFileSync(
    path.join(temp, '.claude/settings.json'),
    JSON.stringify(
      {
        _haus: {
          hooks: ['haus.context-hook'],
          hookCommands: ['haus context --from-hook'],
        },
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'haus context --from-hook' }] }],
        },
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
  assert.equal(settings.hooks.UserPromptSubmit, undefined)
  assert.equal(settings.hooks.PreToolUse.length, 2)
  assert.equal(settings._haus?.hookCommands?.includes('haus context --from-hook'), false)
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
  assert.equal(settings.permissions.deny.includes('Bash(sudo:*)'), true)
})

test('apply --write fails hard when catalog cache is empty', () => {
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
  assert.equal(r.exitCode, 1)
  const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(combined, /run `haus update`/i)
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
  const manualPath = path.join(temp, '.claude/rules/haus.md')
  writeFileSync(manualPath, 'manual override')
  const second = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(second.exitCode, 0)
  assert.equal(second.stdout.includes('Overwriting ./.claude/rules/haus.md'), true)
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

const LEGACY_REVIEW_STUB = 'Run `haus context --task "code review"` then review diff.'

// Security lines were folded into haus.md; the standalone security.md is removed on apply
// when it still matches this historical stub, and preserved when a user has edited it.
const LEGACY_SECURITY_STUB = '- Never read secrets.\n- Block dangerous shell commands.'

function scaffoldApplyProject() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-legacy-review-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'legacy-temp', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
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
  return { temp, env }
}

test('apply does not write haus-review command (removed)', () => {
  const { temp } = scaffoldApplyProject()
  assert.equal(fs.existsSync(path.join(temp, '.claude/commands/haus-review.md')), false)
  // haus-doctor is retained
  assert.equal(fs.existsSync(path.join(temp, '.claude/commands/haus-doctor.md')), true)
})

test('apply removes a legacy haus-review stub that matches the historical content', () => {
  const { temp, env } = scaffoldApplyProject()
  const reviewPath = path.join(temp, '.claude/commands/haus-review.md')

  // Exact stub (no trailing newline) — must be removed.
  writeFileSync(reviewPath, LEGACY_REVIEW_STUB)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(reviewPath), false, 'exact legacy stub should be removed')

  // Stub with a single trailing newline — must also be removed.
  writeFileSync(reviewPath, `${LEGACY_REVIEW_STUB}\n`)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(reviewPath), false, 'stub + trailing newline should be removed')
})

test('apply preserves a user-modified haus-review.md', () => {
  const { temp, env } = scaffoldApplyProject()
  const reviewPath = path.join(temp, '.claude/commands/haus-review.md')

  // Genuinely customised content — must be preserved.
  const custom = 'Run our in-house review checklist, then `haus context`.'
  writeFileSync(reviewPath, custom)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(reviewPath), true, 'customised file should be preserved')
  assert.equal(readFileSync(reviewPath, 'utf8'), custom, 'customised content should be untouched')

  // Whitespace-only edit (extra blank lines) is still a user change — must be preserved.
  const whitespaceEdited = `${LEGACY_REVIEW_STUB}\n\n`
  writeFileSync(reviewPath, whitespaceEdited)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(reviewPath), true, 'whitespace-edited file should be preserved')
  assert.equal(readFileSync(reviewPath, 'utf8'), whitespaceEdited)
})

test('apply folds security lines into haus.md and writes no standalone security.md', () => {
  const { temp } = scaffoldApplyProject()
  const rulesHaus = readFileSync(path.join(temp, '.claude/rules/haus.md'), 'utf8')
  assert.equal(rulesHaus.includes('Never read secrets'), true)
  assert.equal(rulesHaus.includes('Block dangerous shell commands'), true)
  assert.equal(
    fs.existsSync(path.join(temp, '.claude/rules/security.md')),
    false,
    'standalone security.md should not be written',
  )
})

test('apply removes a legacy security.md stub that matches the historical content', () => {
  const { temp, env } = scaffoldApplyProject()
  const securityPath = path.join(temp, '.claude/rules/security.md')

  // Exact stub (no trailing newline) — must be removed.
  writeFileSync(securityPath, LEGACY_SECURITY_STUB)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(securityPath), false, 'exact legacy stub should be removed')

  // Stub with a single trailing newline (as historically written) — must also be removed.
  writeFileSync(securityPath, `${LEGACY_SECURITY_STUB}\n`)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(securityPath), false, 'stub + trailing newline should be removed')
})

test('apply preserves a user-modified security.md', () => {
  const { temp, env } = scaffoldApplyProject()
  const securityPath = path.join(temp, '.claude/rules/security.md')

  const custom = '- Never read secrets.\n- Also: rotate keys quarterly per our policy.'
  writeFileSync(securityPath, custom)
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  assert.equal(fs.existsSync(securityPath), true, 'customised security.md should be preserved')
  assert.equal(readFileSync(securityPath, 'utf8'), custom, 'customised content should be untouched')
})

test('apply removes all legacy readerless .haus-workflow artifacts', () => {
  const { temp, env } = scaffoldApplyProject()
  // Every readerless, machine-generated artifact that haus no longer writes. On upgrade,
  // `apply` must prune them so the output set actually shrinks (PR "11 files -> 5" goal).
  const legacy = [
    'config.json',
    'selected-context.json',
    'dependency-map.json',
    'scan-hashes.json',
    'recommended-hooks.json',
    'recommended-rules.json',
    'repo-summary.md',
  ]
  for (const rel of legacy) {
    writeFileSync(path.join(temp, '.haus-workflow', rel), 'stale')
  }
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp, env })
  for (const rel of legacy) {
    assert.equal(
      fs.existsSync(path.join(temp, '.haus-workflow', rel)),
      false,
      `legacy ${rel} should be removed on apply`,
    )
  }
})
