import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync } from 'node:fs'

import {
  discoverRepos,
  mergeWorkspaceConfig,
  renderWorkspaceYaml,
  runDiscover,
} from '../src/commands/workspace/discover.ts'

// Scan (used for best-effort role detection) reads files only; no catalog needed.

function writePkg(dir, json) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json, null, 2))
}

function writeComposer(dir, json) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'composer.json'), JSON.stringify(json, null, 2))
}

function gitDir(dir) {
  mkdirSync(path.join(dir, '.git'), { recursive: true })
  writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
}

/**
 * Build a workspace fixture:
 *  ws/frontend           package.json (name acme-frontend, react)         → repo
 *  ws/api                composer.json (acme/api)                         → repo "api"
 *  ws/services/worker    .git + package.json (worker)                     → repo (own .git)
 *  ws/mono               package.json (mono)                             → repo
 *  ws/mono/packages/ui   package.json (ui)                               → collapsed into mono
 *  ws/frontend/node_modules/dep/package.json                              → decoy (ignored)
 *  ws/api/vendor/lib/composer.json                                        → decoy (ignored)
 *  ws/a/b/c/d            package.json (deeprepo)                          → beyond default depth
 *  ws/cycle -> ws        symlink loop                                     → not followed
 */
function makeWorkspace() {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-discover-'))
  writePkg(path.join(ws, 'frontend'), { name: 'acme-frontend', dependencies: { react: '19.0.0' } })
  writeComposer(path.join(ws, 'api'), { name: 'acme/api' })

  gitDir(path.join(ws, 'services', 'worker'))
  writePkg(path.join(ws, 'services', 'worker'), { name: 'worker' })

  writePkg(path.join(ws, 'mono'), { name: 'mono' })
  writePkg(path.join(ws, 'mono', 'packages', 'ui'), { name: 'ui' })

  writePkg(path.join(ws, 'frontend', 'node_modules', 'dep'), { name: 'dep' })
  writeComposer(path.join(ws, 'api', 'vendor', 'lib'), { name: 'vendor/lib' })

  writePkg(path.join(ws, 'a', 'b', 'c', 'd'), { name: 'deeprepo' })

  try {
    symlinkSync(ws, path.join(ws, 'cycle'), 'dir')
  } catch {
    // some CI sandboxes disallow symlinks — the cycle assertion is then vacuously true
  }
  return ws
}

test('discoverRepos finds nested repos, excludes decoys, collapses monorepo packages', async () => {
  const ws = makeWorkspace()
  const repos = await discoverRepos(ws)
  const names = repos.map((r) => r.name).sort()
  const paths = repos.map((r) => r.path).sort()

  assert.ok(names.includes('acme-frontend'), `expected acme-frontend, got ${names.join(',')}`)
  assert.ok(names.includes('api'), 'composer-only repo discovered with basename')
  assert.ok(names.includes('worker'), 'nested repo with own .git discovered')
  assert.ok(names.includes('mono'), 'monorepo root discovered')

  // Monorepo package collapsed into its parent repo root.
  assert.ok(!names.includes('ui'), 'nested manifest package must collapse into mono')
  // node_modules / vendor decoys excluded.
  assert.ok(!paths.some((p) => p.includes('node_modules')), 'node_modules excluded')
  assert.ok(!paths.some((p) => p.includes('vendor')), 'vendor excluded')
})

test('discoverRepos resolves paths relative to workspace root and detects a role string', async () => {
  const ws = makeWorkspace()
  const repos = await discoverRepos(ws)
  const worker = repos.find((r) => r.name === 'worker')
  assert.ok(worker, 'worker repo present')
  assert.equal(worker.path, path.join('services', 'worker'))
  assert.equal(typeof worker.role, 'string')
  assert.ok(worker.role.length > 0, 'role defaults to non-empty (auto)')
  // Workspace-root-relative paths only (no absolute leakage).
  for (const r of repos) assert.ok(!path.isAbsolute(r.path), `path must be relative: ${r.path}`)
})

test('discoverRepos respects maxDepth (default excludes deep repo; override includes it)', async () => {
  const ws = makeWorkspace()
  const shallow = await discoverRepos(ws)
  assert.ok(
    !shallow.some((r) => r.name === 'deeprepo'),
    'repo beyond default depth (3) must be excluded',
  )
  const deep = await discoverRepos(ws, 6)
  assert.ok(deep.some((r) => r.name === 'deeprepo'), 'override depth surfaces the deep repo')
})

test('discoverRepos does not follow symlink cycles', async () => {
  const ws = makeWorkspace()
  const repos = await discoverRepos(ws)
  assert.ok(!repos.some((r) => r.path.split(path.sep).includes('cycle')), 'symlink cycle not followed')
})

test('mergeWorkspaceConfig preserves user edits, appends new, never deletes', () => {
  const existing = {
    client: 'acme-corp',
    repos: [
      { name: 'frontend-renamed', path: 'frontend', role: 'storefront' },
      { name: 'gone', path: 'removed-repo', role: 'legacy' },
    ],
    relationships: [{ from: 'frontend', to: 'api' }],
  }
  const discovered = [
    { name: 'acme-frontend', path: 'frontend', role: 'frontend' },
    { name: 'api', path: 'api', role: 'backend' },
  ]
  const merged = mergeWorkspaceConfig(existing, discovered)

  // Top-level client + relationships preserved.
  assert.equal(merged.client, 'acme-corp')
  assert.deepEqual(merged.relationships, [{ from: 'frontend', to: 'api' }])

  const byPath = Object.fromEntries(merged.repos.map((r) => [r.path, r]))
  // User-edited name/role for an existing path preserved over discovery.
  assert.equal(byPath['frontend'].name, 'frontend-renamed')
  assert.equal(byPath['frontend'].role, 'storefront')
  // New repo appended.
  assert.ok(byPath['api'], 'newly discovered repo appended')
  assert.equal(byPath['api'].name, 'api')
  // Existing repo missing from discovery is never deleted.
  assert.ok(byPath['removed-repo'], 'existing repo not deleted on merge')
})

test('mergeWorkspaceConfig overrides client when one is supplied', () => {
  const merged = mergeWorkspaceConfig(undefined, [{ name: 'x', path: 'x', role: 'auto' }], {
    client: 'new-client',
  })
  assert.equal(merged.client, 'new-client')
  assert.equal(merged.repos.length, 1)
  assert.deepEqual(merged.relationships, [])
})

test('runDiscover --write persists yaml and merges with an existing edited file', async () => {
  const ws = makeWorkspace()
  // Pre-seed an edited yaml: renamed frontend + a relationship + a stale repo.
  writeFileSync(
    path.join(ws, 'haus.workspace.yaml'),
    [
      'client: acme-corp',
      'repos:',
      '  - name: storefront',
      '    path: frontend',
      '    role: storefront',
      '  - name: legacy',
      '    path: old-service',
      '    role: legacy',
      'relationships:',
      '  - from: frontend',
      '    to: api',
      '',
    ].join('\n'),
  )

  await runDiscover(ws, { write: true })
  assert.ok(existsSync(path.join(ws, 'haus.workspace.yaml')))
  const text = readFileSync(path.join(ws, 'haus.workspace.yaml'), 'utf8')
  assert.ok(text.includes('client: acme-corp'), 'existing client preserved')
  assert.ok(text.includes('name: storefront'), 'user-edited name preserved')
  assert.ok(text.includes('path: old-service'), 'stale repo not deleted')
  assert.ok(text.includes('name: api'), 'newly discovered repo appended')
  assert.ok(text.includes('from: frontend'), 'relationships carried through')
})

test('runDiscover without --write does not persist yaml', async () => {
  const ws = makeWorkspace()
  await runDiscover(ws, {})
  assert.ok(!existsSync(path.join(ws, 'haus.workspace.yaml')), 'preview must not write')
})

test('runDiscover --json with client emits structured output without writing', async () => {
  const ws = makeWorkspace()
  await runDiscover(ws, { json: true, client: 'new-client' })
  assert.ok(!existsSync(path.join(ws, 'haus.workspace.yaml')))
})

test('runDiscover sets exit code when no repos are found', async () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), 'haus-ws-empty-'))
  const prev = process.exitCode
  process.exitCode = 0
  await runDiscover(empty, {})
  assert.equal(process.exitCode, 1, 'empty workspace flags non-zero exit')
  process.exitCode = prev
})

test('renderWorkspaceYaml round-trips through the existing yaml shape', () => {
  const yaml = renderWorkspaceYaml({
    client: 'acme',
    repos: [{ name: 'frontend', path: 'frontend', role: 'frontend' }],
    relationships: [],
  })
  assert.ok(yaml.includes('client: acme'))
  assert.ok(yaml.includes('repos:'))
  assert.ok(yaml.includes('name: frontend'))
  assert.ok(yaml.includes('path: frontend'))
  assert.ok(yaml.includes('relationships:'))
})
