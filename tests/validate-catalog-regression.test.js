import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

const cli = () => path.resolve('dist/cli.js')

function makeCatalogRoot(items, files = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-validate-catalog-'))
  writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify({ version: '1.0.0', items }, null, 2),
  )
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

function runValidateCatalog(root) {
  return execaSync('node', [cli(), 'validate-catalog', path.join(root, 'manifest.json')], {
    reject: false,
  })
}

const CURATED_SKILL_MD = `---
description: Use when testing the superpowers convention.
---

Every project goes through this process. A todo list is fine here.
`

const SKILL_MD_NO_DESCRIPTION = `---
name: no-desc
---

# Skill without a description frontmatter field.
`

test('validate-catalog accepts a skill whose when-signal is frontmatter description only', () => {
  const root = makeCatalogRoot(
    [
      {
        id: 'haus.superpowers-test',
        version: '1.0.0',
        source: 'curated',
        type: 'skill',
        path: 'skills/superpowers/test',
        title: 'Test',
        purpose: 'Test',
        whenToUse: 'Use when testing.',
        whenNotToUse: 'Do not use otherwise.',
        tags: ['workflow'],
        repoRoles: [],
        tokenEstimate: 100,
        installMode: 'copy-selected',
        reviewStatus: 'approved',
        riskLevel: 'low',
      },
    ],
    { 'skills/superpowers/test/SKILL.md': CURATED_SKILL_MD },
  )
  const r = runValidateCatalog(root)
  assert.equal(r.exitCode, 0, r.stderr || r.stdout)
})

test('validate-catalog rejects a skill missing frontmatter description', () => {
  const root = makeCatalogRoot(
    [
      {
        id: 'haus.test-skill',
        version: '1.0.0',
        source: 'haus',
        type: 'skill',
        path: 'skills/test',
        title: 'Test',
        tags: ['workflow'],
        repoRoles: [],
        tokenEstimate: 100,
        installMode: 'copy-selected',
        reviewStatus: 'approved',
        riskLevel: 'low',
      },
    ],
    { 'skills/test/SKILL.md': SKILL_MD_NO_DESCRIPTION },
  )
  const r = runValidateCatalog(root)
  assert.equal(r.exitCode, 1)
  assert.match(r.stderr ?? '', /SKILL\.md: missing non-empty frontmatter 'description:'/)
})

test('validate-catalog rejects command missing frontmatter description', () => {
  const root = makeCatalogRoot(
    [
      {
        id: 'haus.cmd',
        version: '1.0.0',
        source: 'haus',
        type: 'command',
        path: 'commands/x.md',
        title: 'Cmd',
        tags: ['workflow'],
        repoRoles: [],
        tokenEstimate: 50,
        installMode: 'copy-selected',
        reviewStatus: 'approved',
        riskLevel: 'low',
      },
    ],
    { 'commands/x.md': '# Heading\n\nProse without frontmatter.\n' },
  )
  const r = runValidateCatalog(root)
  assert.equal(r.exitCode, 1)
  assert.match(r.stderr ?? '', /commands\/x\.md: missing non-empty frontmatter 'description:'/)
})

test('validate-catalog accepts command item when file exists', () => {
  const root = makeCatalogRoot(
    [
      {
        id: 'haus.superpowers-write-plan',
        version: '1.0.0',
        source: 'curated',
        type: 'command',
        path: 'commands/superpowers/write-plan.md',
        title: 'Write plan',
        purpose: 'Write a plan',
        whenToUse: 'Use when planning.',
        whenNotToUse: 'Do not use for trivial tasks.',
        tags: ['workflow'],
        repoRoles: [],
        tokenEstimate: 50,
        installMode: 'copy-selected',
        reviewStatus: 'approved',
        riskLevel: 'low',
      },
    ],
    {
      'commands/superpowers/write-plan.md': `---
description: Create plan
---
Invoke skill.
`,
    },
  )
  const r = runValidateCatalog(root)
  assert.equal(r.exitCode, 0, r.stderr || r.stdout)
})

test('validate-catalog rejects command item when file missing', () => {
  const root = makeCatalogRoot([
    {
      id: 'haus.superpowers-missing-cmd',
      version: '1.0.0',
      source: 'curated',
      type: 'command',
      path: 'commands/superpowers/missing.md',
      title: 'Missing',
      purpose: 'Missing',
      whenToUse: 'Never',
      whenNotToUse: 'Always',
      tags: ['workflow'],
      repoRoles: [],
      tokenEstimate: 50,
      installMode: 'copy-selected',
      reviewStatus: 'approved',
      riskLevel: 'low',
    },
  ])
  const r = runValidateCatalog(root)
  assert.equal(r.exitCode, 1)
  assert.match(r.stderr ?? '', /missing command file/)
})
