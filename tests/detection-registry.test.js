import test from 'node:test'
import assert from 'node:assert/strict'

import { runDetection, STACK_BUCKETS } from '../src/scanner/detection-registry.ts'

const ctx = (over = {}) => ({
  deps: new Set(over.deps ?? []),
  files: over.files ?? [],
  contentBlob: over.contentBlob ?? '',
})

test('dependency signal produces the mapped role and stack', () => {
  const out = runDetection(ctx({ deps: ['next', 'react'] }))
  assert.ok(out.roles.includes('next-app'))
  assert.ok(out.roles.includes('react-app'))
  assert.deepEqual(out.stacks.frontend, ['nextjs', 'react19'])
})

test('AND rule requires every signal (react-router-v7 needs both deps)', () => {
  assert.equal(
    runDetection(ctx({ deps: ['react-router'] })).stacks.frontend.includes('react-router-v7'),
    false,
  )
  assert.equal(
    runDetection(ctx({ deps: ['react-router', '@react-router/node'] })).stacks.frontend.includes(
      'react-router-v7',
    ),
    true,
  )
})

test('OR rule matches on either signal (tailwind via dep or config file)', () => {
  assert.ok(runDetection(ctx({ deps: ['tailwindcss'] })).stacks.frontend.includes('tailwindcss'))
  assert.ok(
    runDetection(ctx({ files: ['tailwind.config.ts'] })).stacks.frontend.includes('tailwindcss'),
  )
})

test('depPrefix matches scoped package families (@strapi/*)', () => {
  const out = runDetection(ctx({ deps: ['@strapi/plugin-users-permissions'] }))
  assert.ok(out.roles.includes('strapi-app'))
  assert.ok(out.stacks.backend.includes('strapi'))
})

test('content signal matches the prebuilt blob (NestFactory → nestjs)', () => {
  const out = runDetection(ctx({ contentBlob: 'await NestFactory.create(AppModule)' }))
  assert.ok(out.stacks.backend.includes('nestjs'))
})

test('absent-dependency signal fires when the dep is missing (missing-prettier)', () => {
  assert.ok(runDetection(ctx({ deps: [] })).stacks.tooling.includes('missing-prettier'))
  assert.equal(
    runDetection(ctx({ deps: ['prettier'] })).stacks.tooling.includes('missing-prettier'),
    false,
  )
})

test('empty context still returns all buckets in canonical order', () => {
  const out = runDetection(ctx())
  assert.deepEqual(Object.keys(out.stacks), [...STACK_BUCKETS])
  assert.deepEqual(out.roles, [])
})

test('workspace role fires on repos.manifest.json or haus.workspace.yaml at the scan root', () => {
  assert.ok(runDetection(ctx({ files: ['repos.manifest.json'] })).roles.includes('workspace'))
  assert.ok(runDetection(ctx({ files: ['haus.workspace.yaml'] })).roles.includes('workspace'))
})

test('workspace role does NOT fire for a nested (non-root) occurrence of the marker file', () => {
  // fileEquals matches the exact relative path only — a marker file that isn't at
  // the scan root (e.g. inside a sub-directory) must not trigger the workspace role.
  const out = runDetection(ctx({ files: ['sub/repos.manifest.json', 'nested/haus.workspace.yaml'] }))
  assert.equal(out.roles.includes('workspace'), false)
})

test('workspace role does NOT fire for an ordinary single-repo project with no workspace marker', () => {
  const out = runDetection(ctx({ deps: ['next', 'react'], files: ['next.config.ts'] }))
  assert.equal(out.roles.includes('workspace'), false)
})
