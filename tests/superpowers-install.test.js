import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  SUPERPOWERS_ORIGIN_SOURCE_ID,
  installCatalogSkill,
  installSuperpowersShared,
  rewriteSuperpowersMarkdown,
} from '../src/claude/superpowers-install.js'

test('rewriteSuperpowersMarkdown rewrites skills/shared paths', () => {
  const input = 'See `skills/shared/task-format-reference.md` for the format.'
  const out = rewriteSuperpowersMarkdown(input)
  assert.equal(out, 'See `.claude/skills/shared/task-format-reference.md` for the format.')
})

test('installCatalogSkill rewrites markdown for superpowers items only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-sp-install-'))
  const source = path.join(root, 'source', 'writing-plans')
  const dest = path.join(root, 'dest', 'writing-plans')
  fs.mkdirSync(source, { recursive: true })
  fs.writeFileSync(
    path.join(source, 'SKILL.md'),
    'See skills/shared/task-format-reference.md\n',
    'utf8',
  )

  await installCatalogSkill(source, dest, {
    originSourceId: SUPERPOWERS_ORIGIN_SOURCE_ID,
    dryRun: false,
  })
  const text = fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')
  assert.equal(text.includes('.claude/skills/shared/'), true)

  const hausDest = path.join(root, 'dest', 'nextjs')
  fs.mkdirSync(path.join(root, 'source', 'nextjs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'source', 'nextjs', 'SKILL.md'), 'skills/shared/keep\n', 'utf8')
  await installCatalogSkill(path.join(root, 'source', 'nextjs'), hausDest, {
    originSourceId: 'haus',
    dryRun: false,
  })
  assert.equal(fs.readFileSync(path.join(hausDest, 'SKILL.md'), 'utf8'), 'skills/shared/keep\n')

  fs.rmSync(root, { recursive: true, force: true })
})

test('installCatalogSkill removes stale files removed upstream', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-sp-stale-'))
  const source = path.join(root, 'source', 'brainstorming')
  const dest = path.join(root, 'dest', 'brainstorming')
  fs.mkdirSync(source, { recursive: true })
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\ndescription: x\n---\n', 'utf8')

  fs.mkdirSync(path.join(dest, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(dest, 'SKILL.md'), 'stale\n', 'utf8')
  fs.writeFileSync(path.join(dest, 'scripts', 'old-helper.js'), 'stale\n', 'utf8')

  await installCatalogSkill(source, dest, { originSourceId: 'haus', dryRun: false })
  assert.equal(fs.existsSync(path.join(dest, 'scripts', 'old-helper.js')), false)
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8').includes('description:'), true)

  fs.rmSync(root, { recursive: true, force: true })
})

test('installSuperpowersShared copies shared support tree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-sp-shared-'))
  const contentRoot = path.join(root, 'catalog')
  const projectRoot = path.join(root, 'project')
  const sharedSrc = path.join(contentRoot, 'skills/superpowers/shared')
  fs.mkdirSync(sharedSrc, { recursive: true })
  fs.writeFileSync(path.join(sharedSrc, 'task-format-reference.md'), '# Task format\n', 'utf8')
  fs.mkdirSync(path.join(projectRoot, '.claude'), { recursive: true })

  const rel = await installSuperpowersShared(contentRoot, projectRoot, false)
  assert.equal(rel, '.claude/skills/shared')
  assert.equal(
    fs.existsSync(path.join(projectRoot, '.claude/skills/shared/task-format-reference.md')),
    true,
  )

  fs.rmSync(root, { recursive: true, force: true })
})

test('installSuperpowersShared removes stale shared files removed upstream', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-sp-shared-stale-'))
  const contentRoot = path.join(root, 'catalog')
  const projectRoot = path.join(root, 'project')
  const sharedSrc = path.join(contentRoot, 'skills/superpowers/shared')
  fs.mkdirSync(sharedSrc, { recursive: true })
  fs.writeFileSync(path.join(sharedSrc, 'task-format-reference.md'), '# Task format\n', 'utf8')

  const sharedDest = path.join(projectRoot, '.claude/skills/shared')
  fs.mkdirSync(sharedDest, { recursive: true })
  fs.writeFileSync(path.join(sharedDest, 'removed.md'), 'stale\n', 'utf8')

  await installSuperpowersShared(contentRoot, projectRoot, false)
  assert.equal(fs.existsSync(path.join(sharedDest, 'removed.md')), false)
  assert.equal(fs.existsSync(path.join(sharedDest, 'task-format-reference.md')), true)

  fs.rmSync(root, { recursive: true, force: true })
})
