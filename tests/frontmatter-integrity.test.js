import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

// WS9 (folded into WS7): Claude Code only registers a skill/agent when its content
// starts at line 1 (YAML frontmatter for real catalog items). haus must copy these
// files VERBATIM — this guard fails loudly if any write path ever prepends a header
// (e.g. a HAUS-MANAGED stamp), which would push real frontmatter off line 1 and
// silently de-register the primitive. The assertion is on "no injected header" rather
// than "=== ---" so it holds for the comment-stub fixtures too (env without a populated
// catalog cache falls back to those stubs).

const FIXTURE = path.resolve('tests/fixtures/catalog/manifest.json')

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFilesRecursive(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

test('apply copies skills/agents with YAML frontmatter intact on line 1', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-frontmatter-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      {
        name: 'fm-temp',
        packageManager: 'yarn@4.5.3',
        dependencies: { next: '15.0.0', react: '19.0.0' },
      },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  const env = { ...process.env, HAUS_FIXTURE_CATALOG: FIXTURE }
  const cli = path.resolve('dist/cli.js')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp, env })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp, env })

  const agentFiles = listFilesRecursive(path.join(temp, '.claude', 'agents'))
  const skillFiles = listFilesRecursive(path.join(temp, '.claude', 'skills'))
  const primitives = [...agentFiles, ...skillFiles]

  // Guard against a vacuous pass — the nextjs fixture must produce at least one primitive.
  assert.ok(primitives.length > 0, 'expected apply to write at least one skill/agent file')

  for (const file of primitives) {
    const firstLine = fs.readFileSync(file, 'utf8').split('\n')[0]
    // The regression we guard: a haus-managed stamp prepended ahead of the file's own
    // line 1 (which, for a real catalog item, is its YAML `---` frontmatter).
    assert.ok(
      !firstLine.includes('HAUS-MANAGED'),
      `${path.relative(temp, file)} has a haus header injected on line 1 — this de-registers the primitive: ${firstLine}`,
    )
  }
})
