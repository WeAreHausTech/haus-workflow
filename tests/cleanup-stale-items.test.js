import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execaSync } from 'execa'

const writeSrc = path.resolve('src/claude/write-claude-files.ts').replace(/\\/g, '/')

/** Builds a self-contained consumer project plus a controllable catalog fixture. */
function makeProject(prefix) {
  const root = mkdtempSync(path.join(os.tmpdir(), `haus-${prefix}-`))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: prefix, version: '1.0.0', dependencies: { react: '19.0.0' } }, null, 2),
  )
  mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })

  const catalogDir = path.join(root, 'catalog')
  mkdirSync(catalogDir, { recursive: true })
  return { root, catalogDir }
}

function skillItem(id) {
  const name = id.replace(/[^a-z0-9]+/gi, '-')
  return { id, name, type: 'skill', relPath: `skills/${name}`, dest: `.claude/skills/${name}` }
}

/** Writes a SKILL.md for each item under the catalog content root. */
function writeCatalogContent(catalogDir, items) {
  for (const it of items) {
    const dir = path.join(catalogDir, it.relPath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${it.name}\ndescription: demo\n---\n\n# ${it.name}\n`,
    )
  }
}

/** Writes a manifest variant listing exactly `items`. */
function writeManifest(catalogDir, file, items) {
  const manifest = {
    version: '1.0.0',
    items: items.map((it) => ({
      id: it.id,
      type: 'skill',
      path: it.relPath,
      title: it.name,
      version: '1.0.0',
      source: 'haus',
      tags: [],
    })),
  }
  const p = path.join(catalogDir, file)
  writeFileSync(p, JSON.stringify(manifest, null, 2))
  return p
}

/** Writes recommendation.json recommending exactly `items`. */
function writeRecommendation(root, items) {
  writeFileSync(
    path.join(root, '.haus-workflow/recommendation.json'),
    JSON.stringify(
      {
        mode: 'fast',
        recommended: items.map((it) => ({
          id: it.id,
          type: 'skill',
          reason: 'test',
          selectionMode: 'auto',
        })),
        skipped: [],
        warnings: [],
        estimatedContextTokens: 0,
        selectedRules: 0,
        skippedRules: 0,
        estimatedTokenReductionPct: 0,
      },
      null,
      2,
    ),
  )
}

/** Invokes writeClaudeFiles from source via tsx, against a chosen manifest fixture. */
function runWrite(root, manifestPath, selectedIds) {
  const helper = path.join(root, `run-write-${Math.random().toString(36).slice(2)}.mts`)
  writeFileSync(
    helper,
    [
      `import { writeClaudeFiles } from "${writeSrc}";`,
      `const root = process.argv[2];`,
      `const sel = process.argv[3] === "undefined" ? undefined : JSON.parse(process.argv[3]);`,
      `await writeClaudeFiles(root, false, sel);`,
    ].join('\n'),
  )
  execaSync(
    'node',
    [
      '--import',
      'tsx/esm',
      helper,
      root,
      selectedIds === undefined ? 'undefined' : JSON.stringify(selectedIds),
    ],
    {
      cwd: path.resolve('.'),
      reject: true,
      env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
    },
  )
}

function lockIds(root) {
  const lock = JSON.parse(readFileSync(path.join(root, '.haus-workflow/haus.lock.json'), 'utf8'))
  return lock.map((r) => r.id)
}

test('removed-from-manifest item, unmodified on disk, is deleted', () => {
  const { root, catalogDir } = makeProject('clean-removed')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const both = writeManifest(catalogDir, 'manifest-both.json', [a, b])
  const onlyA = writeManifest(catalogDir, 'manifest-onlyA.json', [a])

  writeRecommendation(root, [a, b])
  runWrite(root, both, undefined)
  assert.equal(existsSync(path.join(root, a.dest)), true)
  assert.equal(existsSync(path.join(root, b.dest)), true)
  assert.deepEqual(lockIds(root).sort(), ['demo.a', 'demo.b'])

  // demo.b removed from catalog → re-apply should delete the unmodified copy.
  writeRecommendation(root, [a])
  runWrite(root, onlyA, undefined)
  assert.equal(existsSync(path.join(root, a.dest)), true, 'demo.a remains')
  assert.equal(existsSync(path.join(root, b.dest)), false, 'stale demo.b deleted')
  assert.deepEqual(lockIds(root), ['demo.a'])
})

test('removed-from-manifest item with local edits is preserved', () => {
  const { root, catalogDir } = makeProject('clean-modified')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const both = writeManifest(catalogDir, 'manifest-both.json', [a, b])
  const onlyA = writeManifest(catalogDir, 'manifest-onlyA.json', [a])

  writeRecommendation(root, [a, b])
  runWrite(root, both, undefined)

  // User edits the installed copy of demo.b.
  writeFileSync(path.join(root, b.dest, 'SKILL.md'), '# locally edited\n')

  writeRecommendation(root, [a])
  runWrite(root, onlyA, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true, 'user-modified stale item kept')
  assert.equal(readFileSync(path.join(root, b.dest, 'SKILL.md'), 'utf8'), '# locally edited\n')
})

test('item deselected via --select but still in manifest is kept', () => {
  const { root, catalogDir } = makeProject('clean-deselect')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const both = writeManifest(catalogDir, 'manifest-both.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, both, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true)

  // Re-apply selecting only demo.a; demo.b stays in the catalog so must NOT be pruned.
  runWrite(root, both, ['demo.a'])
  assert.equal(existsSync(path.join(root, b.dest)), true, 'deselected-but-cataloged item kept')
  assert.deepEqual(lockIds(root), ['demo.a'])
})

test('empty skill dir is pruned after the last item is removed', () => {
  const { root, catalogDir } = makeProject('clean-prune')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [b])
  const onlyB = writeManifest(catalogDir, 'manifest-onlyB.json', [b])
  const empty = writeManifest(catalogDir, 'manifest-empty.json', [])

  writeRecommendation(root, [b])
  runWrite(root, onlyB, undefined)
  assert.equal(existsSync(path.join(root, '.claude/skills')), true)

  writeRecommendation(root, [])
  runWrite(root, empty, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), false, 'stale item removed')
  assert.equal(existsSync(path.join(root, '.claude/skills')), false, 'empty skills dir pruned')
})
