import test from 'node:test'
import assert from 'node:assert/strict'
import { execaSync } from 'execa'

test('semver helpers validate and compare versions', () => {
  const script = [
    "import { satisfiesVersion, normalizeVersion, compareVersions, assertVersionSatisfies } from './src/utils/versions.ts';",
    'const out = {',
    "  ok: satisfiesVersion('22.1.0', '>=22'),",
    "  bad: satisfiesVersion('v21.9.0', '>=22'),",
    "  norm: normalizeVersion('v4.5.3'),",
    "  invalid: normalizeVersion('not-a-version'),",
    "  cmpEq: compareVersions('1.2.0','1.2.0'),",
    "  cmpGt: compareVersions('1.2.1','1.2.0'),",
    "  cmpLt: compareVersions('1.1.9','1.2.0')",
    '};',
    'let threw = false;',
    "try { assertVersionSatisfies('node','20.0.0','>=22'); } catch { threw = true; }",
    'out.threw = threw;',
    'console.log(JSON.stringify(out));',
  ].join('')
  const result = execaSync('node', ['--import', 'tsx', '--eval', script])
  const parsed = JSON.parse(result.stdout)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.bad, false)
  assert.equal(parsed.norm, '4.5.3')
  assert.equal(parsed.invalid, null)
  assert.equal(parsed.cmpEq, 0)
  assert.equal(parsed.cmpGt, 1)
  assert.equal(parsed.cmpLt, -1)
  assert.equal(parsed.threw, true)
})

test('execa wrapper returns structured result', () => {
  const script = [
    "import { runCommand } from './src/utils/exec.ts';",
    '(async () => {',
    "  const result = await runCommand('node', ['-e', \"console.log('ok')\"]);",
    '  console.log(JSON.stringify(result));',
    '})();',
  ].join('')
  const output = execaSync('node', ['--import', 'tsx', '--eval', script]).stdout
  const parsed = JSON.parse(output)
  assert.equal(parsed.exitCode, 0)
  assert.equal(parsed.stdout.trim(), 'ok')
  assert.equal(typeof parsed.stderr, 'string')
})

test('diff helpers detect and summarize changes', () => {
  const script = [
    "import { hasTextChanged, createUnifiedDiff, summarizeDiff } from './src/utils/diff.ts';",
    "const before = 'line1\\nline2\\n';",
    "const after = 'line1\\nline2 changed\\nline3\\n';",
    "const unified = createUnifiedDiff('sample.txt', before, after);",
    'const summary = summarizeDiff(unified);',
    'console.log(JSON.stringify({ unchanged: hasTextChanged(before, before), changed: hasTextChanged(before, after), unified, summary }));',
  ].join('')
  const output = execaSync('node', ['--import', 'tsx', '--eval', script]).stdout
  const parsed = JSON.parse(output)
  assert.equal(parsed.unchanged, false)
  assert.equal(parsed.changed, true)
  assert.equal(parsed.unified.includes('--- sample.txt'), true)
  assert.equal(parsed.unified.includes('+++ sample.txt'), true)
  assert.equal(parsed.summary.additions > 0, true)
  assert.equal(parsed.summary.deletions > 0, true)
})
