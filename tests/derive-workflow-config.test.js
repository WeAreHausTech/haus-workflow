import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { deriveWorkflowConfig } from '../src/claude/derive-workflow-config.ts'
import { writeWorkflowConfig } from '../src/claude/write-workflow-config.ts'

function tmpRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-wfc-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}
const ctx = (over = {}) => ({
  packageManager: 'npm',
  dependencies: [],
  detectedStacks: {},
  ...over,
})

test('prefers real package.json scripts over reconstructed commands', async () => {
  const root = tmpRepo({
    'package.json': JSON.stringify({
      scripts: {
        test: 'vitest run',
        typecheck: 'tsc -p .',
        lint: 'eslint src',
        'lint:fix': 'eslint src --fix',
        'format:check': 'prettier --check .',
        'test:e2e': 'playwright test',
      },
    }),
  })
  const v = await deriveWorkflowConfig(root, ctx({ packageManager: 'yarn' }))
  assert.equal(v.test, 'yarn run test')
  assert.equal(v.typecheck, 'yarn run typecheck')
  assert.equal(v.lint, 'yarn run lint')
  assert.equal(v.lintFix, 'yarn run lint:fix')
  assert.equal(v.formatCheck, 'yarn run format:check')
  assert.equal(v.testE2E, 'yarn run test:e2e')
  fs.rmSync(root, { recursive: true, force: true })
})

test('reconstructs commands from deps/config when no script exists (npm → npx)', async () => {
  const root = tmpRepo({
    'package.json': JSON.stringify({ scripts: {} }),
    'tsconfig.json': '{}',
  })
  const v = await deriveWorkflowConfig(
    root,
    ctx({ dependencies: ['eslint', 'prettier', 'typescript', '@playwright/test', 'zod'] }),
  )
  assert.equal(v.typecheck, 'npx tsc --noEmit')
  assert.equal(v.lint, 'npx eslint .')
  assert.equal(v.lintFix, 'npx eslint . --fix')
  assert.equal(v.formatCheck, 'npx prettier --check .')
  assert.equal(v.testE2E, 'npx playwright test')
  assert.equal(v.validationLibrary, 'zod')
  fs.rmSync(root, { recursive: true, force: true })
})

test('leaves un-inferable fields null (no tool installed)', async () => {
  const root = tmpRepo({ 'package.json': JSON.stringify({ scripts: {} }) })
  const v = await deriveWorkflowConfig(root, ctx())
  assert.equal(v.lint, null)
  assert.equal(v.typecheck, null)
  assert.equal(v.validationLibrary, null)
  assert.equal(v.preCommitTool, null)
  assert.equal(v.specPath, null)
  fs.rmSync(root, { recursive: true, force: true })
})

test('detects pre-commit tool and doc paths', async () => {
  const lefthook = tmpRepo({ 'package.json': '{}', 'lefthook.yml': 'pre-commit:\n' })
  assert.equal((await deriveWorkflowConfig(lefthook, ctx())).preCommitTool, 'lefthook')
  fs.rmSync(lefthook, { recursive: true, force: true })

  const husky = tmpRepo({ 'package.json': '{}', '.husky/pre-commit': '#!/bin/sh\n' })
  assert.equal((await deriveWorkflowConfig(husky, ctx())).preCommitTool, 'husky')
  fs.rmSync(husky, { recursive: true, force: true })

  const docs = tmpRepo({ 'package.json': '{}', 'docs/SPEC.md': '# spec' })
  assert.equal((await deriveWorkflowConfig(docs, ctx())).specPath, 'docs/SPEC.md')
  fs.rmSync(docs, { recursive: true, force: true })
})

test('first write produces real commands, not placeholders', async () => {
  const root = tmpRepo({
    'package.json': JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', lint: 'eslint .' } }),
  })
  const dest = await writeWorkflowConfig(root, false)
  const out = fs.readFileSync(dest, 'utf8')
  assert.match(out, /- Type check: `npm run typecheck`/)
  assert.match(out, /- Lint: `npm run lint`/)
  fs.rmSync(root, { recursive: true, force: true })
})

test('refill fills newly-detectable blank fields but preserves user-edited lines', async () => {
  // First write with NO scripts → Type check / Lint are placeholders.
  const root = tmpRepo({ 'package.json': JSON.stringify({ scripts: {} }) })
  await writeWorkflowConfig(root, false)
  const dest = path.join(root, '.haus-workflow', 'workflow-config.md')

  // Now the repo gains scripts (detectable), and the user hand-edits the Lint line.
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', lint: 'eslint .' } }),
  )
  fs.writeFileSync(
    dest,
    fs.readFileSync(dest, 'utf8').replace(/- Lint: .*/, '- Lint: `my-custom-linter`'),
  )

  const result = await writeWorkflowConfig(root, false, { refill: true })
  assert.ok(result, 'refill should write when there are fillable blanks')
  const out = fs.readFileSync(dest, 'utf8')
  assert.match(out, /- Type check: `npm run typecheck`/, 'blank field filled')
  assert.match(out, /- Lint: `my-custom-linter`/, 'user edit preserved')
  fs.rmSync(root, { recursive: true, force: true })
})

test('refill returns null when no blank fields remain', async () => {
  const root = tmpRepo({ 'package.json': JSON.stringify({ scripts: { test: 'x' } }) })
  await writeWorkflowConfig(root, false)
  const dest = path.join(root, '.haus-workflow', 'workflow-config.md')
  // Fill every placeholder so refill has nothing to do.
  fs.writeFileSync(dest, fs.readFileSync(dest, 'utf8').replace(/<!-- fill in[^>]*-->/g, 'done'))
  const result = await writeWorkflowConfig(root, false, { refill: true })
  assert.equal(result, null)
  fs.rmSync(root, { recursive: true, force: true })
})
