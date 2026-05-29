import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execaSync } from 'execa'

process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

const BLOCK_BEGIN = '<!-- HAUS:BEGIN haus-imports v=1 -->'
const BLOCK_END = '<!-- HAUS:END haus-imports -->'

test('apply --write creates root CLAUDE.md with import block', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-apply-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'p6-test', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  const rootClaudeMd = readFileSync(path.join(temp, 'CLAUDE.md'), 'utf8')
  assert.equal(rootClaudeMd.includes(BLOCK_BEGIN), true)
  assert.equal(rootClaudeMd.includes('@.haus-workflow/WORKFLOW.md'), true)
  assert.equal(rootClaudeMd.includes('@.haus-workflow/workflow-config.md'), true)
  assert.equal(rootClaudeMd.includes('@.haus-workflow/project.md'), true)

  assert.equal(existsSync(path.join(temp, '.haus-workflow', 'project.md')), true)
  assert.equal(existsSync(path.join(temp, '.haus-workflow', 'WORKFLOW.md')), true)
  assert.equal(existsSync(path.join(temp, '.haus-workflow', 'workflow-config.md')), true)

  const projectMd = readFileSync(path.join(temp, '.haus-workflow', 'project.md'), 'utf8')
  assert.equal(projectMd.startsWith('<!-- HAUS-MANAGED id=generated.project-facts'), true)

  const workflow = readFileSync(path.join(temp, '.haus-workflow', 'WORKFLOW.md'), 'utf8')
  assert.equal(workflow.startsWith('<!-- HAUS-MANAGED id=template.workflow'), true)
})

test('apply --write is idempotent — second run produces no diff outside markers', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-idem-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'p6-idem', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  const claudeMdFirst = readFileSync(path.join(temp, 'CLAUDE.md'), 'utf8')

  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  const claudeMdSecond = readFileSync(path.join(temp, 'CLAUDE.md'), 'utf8')
  assert.equal(claudeMdFirst, claudeMdSecond)
})

test('apply --write preserves user content outside haus block', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-preserve-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'p6-preserve', packageManager: 'yarn@4.5.3' }, null, 2),
  )

  const userContent = '# My project\n\nSome user content above the haus block.\n'
  writeFileSync(path.join(temp, 'CLAUDE.md'), userContent)

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  const result = readFileSync(path.join(temp, 'CLAUDE.md'), 'utf8')
  assert.equal(result.includes('# My project'), true)
  assert.equal(result.includes('Some user content above the haus block.'), true)
  assert.equal(result.includes(BLOCK_BEGIN), true)
})

test('apply --write skips WORKFLOW.md when user modified it', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-skip-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'p6-skip', packageManager: 'yarn@4.5.3' }, null, 2),
  )

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  const workflowPath = path.join(temp, '.haus-workflow', 'WORKFLOW.md')
  const original = readFileSync(workflowPath, 'utf8')

  // Simulate user editing the file (keeping the header, modifying body)
  const lines = original.split('\n')
  lines.splice(2, 0, 'USER ADDITION: extra line')
  writeFileSync(workflowPath, lines.join('\n'))

  const result = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], {
    cwd: temp,
    reject: false,
  })
  assert.equal(result.exitCode, 0)
  const output = result.stdout + result.stderr
  assert.equal(output.includes('content modified by user'), true)

  const afterSecondApply = readFileSync(workflowPath, 'utf8')
  assert.equal(afterSecondApply.includes('USER ADDITION: extra line'), true)
})

test('apply --dry-run shows haus-imports block in diff and does not write CLAUDE.md', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-dry-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'p6-dry', packageManager: 'yarn@4.5.3' }, null, 2),
  )

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  const result = execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--dry-run'], {
    cwd: temp,
    reject: false,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout.includes('HAUS:BEGIN haus-imports'), true)
  assert.equal(existsSync(path.join(temp, 'CLAUDE.md')), false)
})

test('.claude/CLAUDE.md is not written (root CLAUDE.md is canonical)', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-p6-no-dot-claude-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'p6-no-dot-claude', packageManager: 'yarn@4.5.3' }, null, 2),
  )

  execaSync('node', [path.resolve('dist/cli.js'), 'scan', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'recommend', '--json'], { cwd: temp })
  execaSync('node', [path.resolve('dist/cli.js'), 'apply', '--write'], { cwd: temp })

  assert.equal(existsSync(path.join(temp, '.claude', 'CLAUDE.md')), false)
  assert.equal(existsSync(path.join(temp, 'CLAUDE.md')), true)
})
