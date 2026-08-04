import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { execaSync } from 'execa'

// haus apply --prune: removes lock-tracked items that fell out of the current
// recommendation without being removed from the catalog manifest (the case
// `haus doctor` only advises on by default — see tests/doctor-orphaned-items.test.js
// and src/recommender/orphaned-items.ts, the shared diff both use).

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

/** Writes a manifest variant listing exactly `items` — usually the same items
 * across a test's two runs, since an "orphaned" item must remain in the manifest
 * throughout (only its presence in recommendation.json changes). */
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
      repoRoles: [],
      tokenEstimate: 100,
      ...(it.formerIds ? { formerIds: it.formerIds } : {}),
      ...(it.reviewStatus ? { reviewStatus: it.reviewStatus } : {}),
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
function runWrite(root, manifestPath, selectedIds, opts = {}) {
  const { dryRun = false, prune = false, quiet = false } = opts
  const helper = path.join(root, `run-write-${Math.random().toString(36).slice(2)}.mts`)
  writeFileSync(
    helper,
    [
      `import { writeClaudeFiles } from "${writeSrc}";`,
      `const root = process.argv[2];`,
      `const sel = process.argv[3] === "undefined" ? undefined : JSON.parse(process.argv[3]);`,
      `await writeClaudeFiles(root, ${JSON.stringify(dryRun)}, sel, { prune: ${JSON.stringify(prune)}, quiet: ${JSON.stringify(quiet)} });`,
    ].join('\n'),
  )
  const result = execaSync(
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
  return result.stdout + result.stderr
}

function lockIds(root) {
  const lock = JSON.parse(readFileSync(path.join(root, '.haus-workflow/haus.lock.json'), 'utf8'))
  return lock.map((r) => r.id)
}

function backupDirs(root) {
  const backupsRoot = path.join(root, '.haus-workflow/backups')
  if (!existsSync(backupsRoot)) return []
  return readdirSync(backupsRoot).filter((name) => name.startsWith('prune-'))
}

test('orphaned item (still in manifest, dropped from recommendation) is left in place without --prune', () => {
  const { root, catalogDir } = makeProject('prune-off')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true)

  // b drops out of the recommendation but stays in the manifest — without --prune
  // this must be left exactly as cleanupStaleCatalogItems already leaves a
  // deselected-but-cataloged item (see cleanup-stale-items.test.js).
  writeRecommendation(root, [a])
  runWrite(root, manifest, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true, 'orphaned item kept without --prune')
  assert.deepEqual(lockIds(root), ['demo.a'])
})

test('orphaned item, unmodified on disk, is removed with --prune', () => {
  const { root, catalogDir } = makeProject('prune-on')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true)

  writeRecommendation(root, [a])
  const output = runWrite(root, manifest, undefined, { prune: true })
  assert.equal(existsSync(path.join(root, b.dest)), false, 'orphaned item pruned')
  assert.deepEqual(lockIds(root), ['demo.a'])
  assert.match(output, /Pruned orphaned/)

  const dirs = backupDirs(root)
  assert.equal(dirs.length, 1, 'exactly one prune backup dir created')
  const backedUp = path.join(root, '.haus-workflow/backups', dirs[0], b.dest, 'SKILL.md')
  assert.equal(existsSync(backedUp), true, 'pruned file was backed up before deletion')
  assert.match(readFileSync(backedUp, 'utf8'), /demo-b/)
})

test('--prune respects --quiet: no backup/pruned messages printed, but pruning still happens', () => {
  const { root, catalogDir } = makeProject('prune-quiet')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)

  writeRecommendation(root, [a])
  const output = runWrite(root, manifest, undefined, { prune: true, quiet: true })
  assert.doesNotMatch(output, /Backed up|Pruned orphaned/, 'quiet must suppress prune messages too')
  assert.equal(
    existsSync(path.join(root, b.dest)),
    false,
    'pruning itself still happens under quiet',
  )
  assert.equal(backupDirs(root).length, 1, 'backup file still written under quiet, just not logged')
})

test('orphaned item that was locally modified is preserved even with --prune', () => {
  const { root, catalogDir } = makeProject('prune-modified')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)
  writeFileSync(path.join(root, b.dest, 'SKILL.md'), '# locally edited\n')

  writeRecommendation(root, [a])
  const output = runWrite(root, manifest, undefined, { prune: true })
  assert.equal(existsSync(path.join(root, b.dest)), true, 'user-modified orphan kept')
  assert.equal(readFileSync(path.join(root, b.dest, 'SKILL.md'), 'utf8'), '# locally edited\n')
  assert.match(output, /modified locally.*leaving in place/)
  assert.equal(backupDirs(root).length, 0, 'no backup made when nothing was pruned')
})

test('orphaned item with no recorded lock hash is preserved even with --prune', () => {
  const { root, catalogDir } = makeProject('prune-no-hash')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)

  const lockPath = path.join(root, '.haus-workflow/haus.lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const bRow = lock.find((r) => r.id === 'demo.b')
  assert.ok(bRow)
  delete bRow.hash
  writeFileSync(lockPath, JSON.stringify(lock, null, 2))

  writeRecommendation(root, [a])
  const output = runWrite(root, manifest, undefined, { prune: true })
  assert.equal(existsSync(path.join(root, b.dest)), true, 'hash-less orphan kept')
  assert.match(output, /no lock hash.*leaving in place/)
})

test('--prune --dry-run reports without touching disk or the lockfile', () => {
  const { root, catalogDir } = makeProject('prune-dry-run')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)
  const lockBefore = readFileSync(path.join(root, '.haus-workflow/haus.lock.json'), 'utf8')

  writeRecommendation(root, [a])
  const output = runWrite(root, manifest, undefined, { dryRun: true, prune: true })
  assert.equal(existsSync(path.join(root, b.dest)), true, 'dry-run must not delete anything')
  assert.equal(
    readFileSync(path.join(root, '.haus-workflow/haus.lock.json'), 'utf8'),
    lockBefore,
    'dry-run must not touch the lockfile',
  )
  assert.equal(backupDirs(root).length, 0, 'dry-run must not create a backup')
  assert.match(output, /\[dry-run\] would prune orphaned/)
})

test('no items orphaned: --prune is a no-op', () => {
  const { root, catalogDir } = makeProject('prune-noop')
  const a = skillItem('demo.a')
  writeCatalogContent(catalogDir, [a])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a])

  writeRecommendation(root, [a])
  runWrite(root, manifest, undefined)
  const output = runWrite(root, manifest, undefined, { prune: true })
  assert.equal(existsSync(path.join(root, a.dest)), true)
  assert.deepEqual(lockIds(root), ['demo.a'])
  assert.doesNotMatch(output, /[Pp]runed?/)
})

test('a former id mid-rename migration is never treated as orphaned by --prune', () => {
  const { root, catalogDir } = makeProject('prune-migration')
  const a = skillItem('demo.a')
  const bOld = skillItem('demo.b-old')
  const bNew = { ...skillItem('demo.b-new'), formerIds: ['demo.b-old'] }
  writeCatalogContent(catalogDir, [a, bOld, bNew])
  const before = writeManifest(catalogDir, 'manifest-before.json', [a, bOld])
  const after = writeManifest(catalogDir, 'manifest-after.json', [a, bNew])

  writeRecommendation(root, [a, bOld])
  runWrite(root, before, undefined)
  // Modify the old-id install so cleanupMigratedCatalogItems leaves it in place
  // instead of silently migrating it away — this is the case that would otherwise
  // also look "orphaned" to a naive recommendedIds-only check.
  writeFileSync(path.join(root, bOld.dest, 'SKILL.md'), '# locally edited\n')

  writeRecommendation(root, [a, bNew])
  const output = runWrite(root, after, undefined, { prune: true })
  assert.match(output, /Former catalog item demo\.b-old was modified locally/)
  assert.doesNotMatch(
    output,
    /Orphaned catalog item demo\.b-old/,
    'a mid-rename former id must not also be reported as orphaned',
  )
  assert.equal(existsSync(path.join(root, bOld.dest)), true, 'modified former-id install kept')
  assert.equal(readFileSync(path.join(root, bOld.dest, 'SKILL.md'), 'utf8'), '# locally edited\n')
})

test('a deprecated, locally-modified item is warned about once, not double-processed by --prune', () => {
  const { root, catalogDir } = makeProject('prune-deprecated-overlap')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const approved = writeManifest(catalogDir, 'manifest-approved.json', [a, b])
  const deprecated = writeManifest(catalogDir, 'manifest-deprecated.json', [
    a,
    { ...b, reviewStatus: 'deprecated' },
  ])

  writeRecommendation(root, [a, b])
  runWrite(root, approved, undefined)
  writeFileSync(path.join(root, b.dest, 'SKILL.md'), '# locally edited\n')

  // b is deprecated (cleanupStaleCatalogItems's territory) AND no longer recommended
  // (pruneOrphanedCatalogItems's territory) in the same run — must not be double-warned.
  writeRecommendation(root, [a])
  const output = runWrite(root, deprecated, undefined, { prune: true })
  assert.match(output, /Deprecated catalog item demo\.b was modified locally/)
  assert.doesNotMatch(
    output,
    /Orphaned catalog item demo\.b/,
    'a deprecated item must not also be reported as orphaned',
  )
  assert.equal(existsSync(path.join(root, b.dest)), true, 'modified deprecated item kept')
})

test('an item deselected this run via --ids, but still in the recommendation, is not pruned', () => {
  const { root, catalogDir } = makeProject('prune-deselected')
  const a = skillItem('demo.a')
  const b = skillItem('demo.b')
  writeCatalogContent(catalogDir, [a, b])
  const manifest = writeManifest(catalogDir, 'manifest.json', [a, b])

  writeRecommendation(root, [a, b])
  runWrite(root, manifest, undefined)
  assert.equal(existsSync(path.join(root, b.dest)), true)

  // recommendation.json is UNCHANGED (still recommends both) — only this run's
  // explicit selection narrows to demo.a. b must be left alone even with --prune.
  const output = runWrite(root, manifest, ['demo.a'], { prune: true })
  assert.equal(
    existsSync(path.join(root, b.dest)),
    true,
    'still-recommended-but-deselected-this-run item must not be pruned',
  )
  assert.doesNotMatch(output, /Orphaned catalog item demo\.b/)
})
