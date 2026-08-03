import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

import { buildFormerIdMap } from '../src/catalog/former-ids.js'
import { validateFormerIds } from '../src/catalog/manifest-item-fields.js'

const cli = path.resolve('dist/cli.js')
const writeClaudeFilesSource = path.resolve('src/claude/write-claude-files.ts').replace(/\\/g, '/')

function writeSkill(catalogDir, name, body) {
  const skillDir = path.join(catalogDir, 'skills', name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\ndescription: migration fixture\n---\n\n${body}\n`,
  )
}

function writeManifest(catalogDir, item) {
  const manifestPath = path.join(catalogDir, 'manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: '1.0.0',
        items: [
          {
            ...item,
            type: 'skill',
            source: 'haus',
            title: item.id,
            tags: [],
            repoRoles: [],
            tokenEstimate: 10,
          },
        ],
      },
      null,
      2,
    ),
  )
  return manifestPath
}

function writeRecommendation(root, id) {
  mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(root, '.haus-workflow', 'recommendation.json'),
    JSON.stringify(
      {
        recommended: [
          {
            id,
            type: 'skill',
            reason: 'fixture',
            reasons: [],
            selectionMode: 'manual',
            install: true,
          },
        ],
        skipped: [],
        warnings: [],
        estimatedContextTokens: 0,
        selectedRules: 1,
        skippedRules: 0,
        estimatedTokenReductionPct: 0,
      },
      null,
      2,
    ),
  )
}

function makeProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-former-id-'))
  const catalogDir = path.join(root, 'catalog')
  mkdirSync(catalogDir, { recursive: true })
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'former-id-fixture' }))
  return { root, catalogDir }
}

function runApply(root, manifestPath) {
  return execaSync('node', [cli, 'apply', '--write', '--allow-empty-cache'], {
    cwd: root,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
}

function runWriteSelected(root, manifestPath, selectedIds) {
  const helper = path.join(root, 'run-selected-apply.mts')
  writeFileSync(
    helper,
    [
      `import { writeClaudeFiles } from "${writeClaudeFilesSource}";`,
      `await writeClaudeFiles(process.argv[2], false, JSON.parse(process.argv[3]));`,
    ].join('\n'),
  )
  return execaSync(
    'node',
    ['--import', 'tsx/esm', helper, root, JSON.stringify(selectedIds)],
    {
      cwd: path.resolve('.'),
      reject: false,
      env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
    },
  )
}

test('buildFormerIdMap maps former ids to current ids', () => {
  assert.deepEqual(
    [...buildFormerIdMap([{ id: 'new', formerIds: ['old', 'older'] }])],
    [
      ['old', 'new'],
      ['older', 'new'],
    ],
  )
})

test('buildFormerIdMap names both owners on duplicate formerId', () => {
  assert.throws(
    () =>
      buildFormerIdMap([
        { id: 'alpha', formerIds: ['shared'] },
        { id: 'beta', formerIds: ['shared'] },
      ]),
    /duplicate formerId shared claimed by both alpha and beta/,
  )
})

test('validateFormerIds rejects duplicate claims and current-id collisions', () => {
  assert.deepEqual(
    validateFormerIds([
      { id: 'current', formerIds: ['old', 'other'] },
      { id: 'other', formerIds: ['old'] },
    ]),
    [
      'current: formerId "other" conflicts with another item\'s current id',
      'formerId "old" claimed by both current and other',
    ],
  )
})

test('apply migrates a former lock id and refreshes installed content without rescan', () => {
  const { root, catalogDir } = makeProject()
  writeSkill(catalogDir, 'old-name', 'old content')
  const manifestPath = writeManifest(catalogDir, {
    id: 'catalog.old',
    path: 'skills/old-name',
  })
  writeRecommendation(root, 'catalog.old')
  const initial = runApply(root, manifestPath)
  assert.equal(initial.exitCode, 0, initial.stderr)

  writeSkill(catalogDir, 'new-name', 'new content')
  writeManifest(catalogDir, {
    id: 'catalog.new',
    formerIds: ['catalog.old'],
    path: 'skills/new-name',
  })

  const dryRun = execaSync('node', [cli, 'apply', '--dry-run', '--allow-empty-cache'], {
    cwd: root,
    reject: false,
    env: { ...process.env, HAUS_FIXTURE_CATALOG: manifestPath },
  })
  assert.equal(dryRun.exitCode, 0, dryRun.stderr)
  assert.match(dryRun.stdout, /would migrate catalog\.old → catalog\.new \(upstream rename\)/)
  assert.doesNotMatch(dryRun.stderr, /^migrated /m)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'old-name')), true)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'new-name')), false)

  const migrated = runApply(root, manifestPath)
  assert.equal(migrated.exitCode, 0, migrated.stderr)
  assert.match(migrated.stderr, /migrated catalog\.old → catalog\.new \(upstream rename\)/)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'old-name')), false)
  assert.match(
    readFileSync(path.join(root, '.claude', 'skills', 'new-name', 'SKILL.md'), 'utf8'),
    /new content/,
  )

  const lock = JSON.parse(
    readFileSync(path.join(root, '.haus-workflow', 'haus.lock.json'), 'utf8'),
  )
  assert.equal(lock.length, 1)
  assert.equal(lock[0].id, 'catalog.new')
  assert.deepEqual(lock[0].paths, ['.claude/skills/new-name'])
  assert.match(lock[0].hash, /^sha256-/)
})

test('apply --select migrates when only the current id is selected', () => {
  const { root, catalogDir } = makeProject()
  writeSkill(catalogDir, 'old-name', 'old content')
  const manifestPath = writeManifest(catalogDir, {
    id: 'catalog.old',
    path: 'skills/old-name',
  })
  writeRecommendation(root, 'catalog.old')
  const initial = runApply(root, manifestPath)
  assert.equal(initial.exitCode, 0, initial.stderr)

  writeSkill(catalogDir, 'new-name', 'new content')
  writeManifest(catalogDir, {
    id: 'catalog.new',
    formerIds: ['catalog.old'],
    path: 'skills/new-name',
  })

  const migrated = runWriteSelected(root, manifestPath, ['catalog.new'])
  assert.equal(migrated.exitCode, 0, migrated.stderr)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'new-name', 'SKILL.md')), true)
  const lock = JSON.parse(
    readFileSync(path.join(root, '.haus-workflow', 'haus.lock.json'), 'utf8'),
  )
  assert.deepEqual(lock.map((entry) => entry.id), ['catalog.new'])
})

test('apply --select leaves deselected former-id installs untouched', () => {
  const { root, catalogDir } = makeProject()
  writeSkill(catalogDir, 'old-name', 'old content')
  const manifestPath = writeManifest(catalogDir, {
    id: 'catalog.old',
    path: 'skills/old-name',
  })
  writeRecommendation(root, 'catalog.old')
  const initial = runApply(root, manifestPath)
  assert.equal(initial.exitCode, 0, initial.stderr)

  writeSkill(catalogDir, 'new-name', 'new content')
  writeManifest(catalogDir, {
    id: 'catalog.new',
    formerIds: ['catalog.old'],
    path: 'skills/new-name',
  })

  const skipped = runWriteSelected(root, manifestPath, ['catalog.unrelated'])
  assert.equal(skipped.exitCode, 0, skipped.stderr)
  assert.doesNotMatch(skipped.stderr, /migrated catalog\.old/)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'old-name', 'SKILL.md')), true)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'new-name')), false)
})

test('update --check reports a pending former-id migration without writing', () => {
  const { root, catalogDir } = makeProject()
  writeSkill(catalogDir, 'old-name', 'old content')
  const manifestPath = writeManifest(catalogDir, {
    id: 'catalog.old',
    path: 'skills/old-name',
  })
  writeRecommendation(root, 'catalog.old')
  const initial = runApply(root, manifestPath)
  assert.equal(initial.exitCode, 0, initial.stderr)

  writeSkill(catalogDir, 'new-name', 'new content')
  writeManifest(catalogDir, {
    id: 'catalog.new',
    formerIds: ['catalog.old'],
    path: 'skills/new-name',
  })
  const lockPath = path.join(root, '.haus-workflow', 'haus.lock.json')
  const lockBefore = readFileSync(lockPath, 'utf8')

  const checked = execaSync('node', [cli, 'update', '--check'], {
    cwd: root,
    reject: false,
    env: {
      ...process.env,
      HAUS_FIXTURE_CATALOG: manifestPath,
      HAUS_SKIP_NPM_CHECK: '1',
      HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(root, 'cache'),
      HOME: path.join(root, 'home'),
      USERPROFILE: path.join(root, 'home'),
    },
  })

  assert.equal(checked.exitCode, 1)
  const result = JSON.parse(checked.stdout)
  assert.deepEqual(result.formerIdMigrations, [
    { oldId: 'catalog.old', newId: 'catalog.new' },
  ])
  assert.equal(readFileSync(lockPath, 'utf8'), lockBefore)
  assert.equal(existsSync(path.join(root, '.claude', 'skills', 'new-name')), false)
})
