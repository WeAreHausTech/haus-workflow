import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { execa } from 'execa'

const DIST_CLI = path.resolve('dist/cli.js')

const FIXTURE_MANIFEST = {
  version: '1.0.0',
  items: [
    {
      id: 'haus.react19-patterns',
      type: 'skill',
      source: 'haus',
      path: 'skills/react19-patterns',
      title: 'React 19 patterns',
      tags: ['react'],
      repoRoles: [],
      tokenEstimate: 1000,
      requiresAny: [{ dependency: 'react' }],
      references: ['references/conventions.md', 'references/scope.md', 'https://react.dev/'],
    },
    {
      id: 'haus.code-reviewer-agent',
      type: 'agent',
      source: 'haus',
      path: 'agents/code-reviewer.md',
      title: 'Code reviewer',
      tags: [],
      repoRoles: [],
      tokenEstimate: 500,
    },
  ],
}

const FIXTURE_SKILL_MD = '## Use when\nAlways.\n## Do not use when\nNever.\n'
const FIXTURE_AGENT_MD = '---\ndescription: Review.\n---\n## Use when\nAlways.\n'

const REACT19_TREE = ['SKILL.md', 'references/conventions.md', 'references/scope.md']

function treeHandler(files) {
  return {
    [`/__haus_tree__/${encodeURIComponent('skills/react19-patterns')}`]: {
      body: JSON.stringify(files),
    },
  }
}

function startMockServer(handlers) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url ?? '/'
      const handler = handlers[url]
      if (handler) {
        const { status = 200, body, contentType } = handler
        const type =
          contentType ??
          (url.startsWith('/__haus_tree__/') ? 'application/json' : 'text/plain; charset=utf-8')
        res.writeHead(status, { 'Content-Type': type })
        res.end(body)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

function makeProjectDir() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-rc-'))
  fs.mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  fs.writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'rc-test', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  fs.writeFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), JSON.stringify([], null, 2))
  return temp
}

// Returns a port that was briefly bound then closed — guaranteed unreachable (no process listens on it).
function getClosedPort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Use async execa (not execaSync) so the Node.js event loop stays alive for mock server.
async function runCli(args, options = {}) {
  return await execa('node', [DIST_CLI, ...args], { reject: false, ...options })
}

test('haus update: catalog sync writes manifest to cache on success', async () => {
  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST), contentType: 'application/json' },
    ...treeHandler(REACT19_TREE),
    '/skills/react19-patterns/SKILL.md': { body: FIXTURE_SKILL_MD },
    '/skills/react19-patterns/references/conventions.md': { body: '# conventions' },
    '/skills/react19-patterns/references/scope.md': { body: '# scope' },
    '/agents/code-reviewer.md': { body: FIXTURE_AGENT_MD },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-'))
  const temp = makeProjectDir()

  try {
    const out = await runCli(['update'], {
      cwd: temp,
      env: {
        ...process.env,
        HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
        HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
      },
    })
    assert.equal(out.exitCode, 0, `update failed:\n${out.stdout}\n${out.stderr}`)
    const combined = out.stdout + out.stderr
    assert.equal(combined.includes('Syncing remote catalog'), true)

    const manifestPath = path.join(cacheDir, 'manifest.json')
    assert.equal(fs.existsSync(manifestPath), true, 'manifest not written to cache')
    const cached = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(cached.items.length, 2)

    // Skill content written
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'skills/react19-patterns/SKILL.md')),
      true,
      'skill SKILL.md not cached',
    )
    // Skill nested reference files written (regression: only SKILL.md was cached)
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'skills/react19-patterns/references/conventions.md')),
      true,
      'skill reference conventions.md not cached',
    )
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'skills/react19-patterns/references/scope.md')),
      true,
      'skill reference scope.md not cached',
    )
    // External URL references must NOT be written to the cache
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'skills/react19-patterns/https:')),
      false,
      'external URL reference should not be cached',
    )
    // Agent content written
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'agents/code-reviewer.md')),
      true,
      'agent md not cached',
    )
  } finally {
    await stopServer(server)
  }
})

test('haus update: offline fallback does not crash when server unreachable', async () => {
  const temp = makeProjectDir()
  const closedPort = await getClosedPort()
  const out = await runCli(['update'], {
    cwd: temp,
    env: { ...process.env, HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${closedPort}` },
  })
  assert.equal(out.exitCode, 0)
  assert.equal(out.stdout.includes('Update applied'), true)
  const combined = out.stdout + out.stderr
  assert.equal(
    combined.includes('Remote catalog fetch failed') || combined.includes('Catalog'),
    true,
  )
})

test('haus update: caches extra skill files from full tree listing', async () => {
  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST), contentType: 'application/json' },
    ...treeHandler([...REACT19_TREE, 'scripts/helper.js']),
    '/skills/react19-patterns/SKILL.md': { body: FIXTURE_SKILL_MD },
    '/skills/react19-patterns/references/conventions.md': { body: '# conventions' },
    '/skills/react19-patterns/references/scope.md': { body: '# scope' },
    '/skills/react19-patterns/scripts/helper.js': { body: 'export const ok = true;\n' },
    '/agents/code-reviewer.md': { body: FIXTURE_AGENT_MD },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-tree-'))
  const temp = makeProjectDir()

  try {
    const out = await runCli(['update'], {
      cwd: temp,
      env: {
        ...process.env,
        HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
        HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
      },
    })
    assert.equal(out.exitCode, 0, `update failed:\n${out.stdout}\n${out.stderr}`)
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'skills/react19-patterns/scripts/helper.js')),
      true,
      'extra skill file from tree not cached',
    )
  } finally {
    await stopServer(server)
  }
})

test('haus update: no duplicate downloads for already-cached items', async () => {
  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST), contentType: 'application/json' },
    ...treeHandler(REACT19_TREE),
    '/skills/react19-patterns/SKILL.md': { body: FIXTURE_SKILL_MD },
    '/skills/react19-patterns/references/conventions.md': { body: '# conventions' },
    '/skills/react19-patterns/references/scope.md': { body: '# scope' },
    '/agents/code-reviewer.md': { body: FIXTURE_AGENT_MD },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-nodup-'))
  const temp = makeProjectDir()

  // Pre-populate the skill so it appears already cached
  fs.mkdirSync(path.join(cacheDir, 'skills/react19-patterns/references'), { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/SKILL.md'), FIXTURE_SKILL_MD)
  fs.writeFileSync(
    path.join(cacheDir, 'skills/react19-patterns/references/conventions.md'),
    '# conventions',
  )
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/references/scope.md'), '# scope')

  try {
    const out = await runCli(['update'], {
      cwd: temp,
      env: {
        ...process.env,
        HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
        HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
      },
    })
    assert.equal(out.exitCode, 0)
    const combined = out.stdout + out.stderr
    // Skill content unchanged; only the agent should appear as a new download.
    assert.equal(combined.includes('Catalog refreshed'), false)
    if (combined.includes('new item(s)')) {
      assert.equal(combined.includes('code-reviewer-agent'), true, 'agent should be new')
      assert.equal(
        /new item\(s\):[^\n]*react19/.test(combined),
        false,
        'skill should not be listed as new',
      )
    }
  } finally {
    await stopServer(server)
  }
})

test('haus update: refreshes cached items when remote content changes', async () => {
  const STALE_SKILL = '## Use when\nStale.\n## Do not use when\nNever.\n'
  const FRESH_SKILL = '## Use when\nFresh.\n## Do not use when\nNever.\n'
  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST), contentType: 'application/json' },
    ...treeHandler(['SKILL.md']),
    '/skills/react19-patterns/SKILL.md': { body: FRESH_SKILL },
    '/agents/code-reviewer.md': { body: FIXTURE_AGENT_MD },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-refresh-'))
  fs.mkdirSync(path.join(cacheDir, 'skills/react19-patterns'), { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/SKILL.md'), STALE_SKILL)
  fs.writeFileSync(
    path.join(cacheDir, 'manifest.json'),
    `${JSON.stringify(FIXTURE_MANIFEST, null, 2)}\n`,
  )

  const temp = makeProjectDir()

  try {
    const out = await runCli(['update'], {
      cwd: temp,
      env: {
        ...process.env,
        HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
        HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
      },
    })
    assert.equal(out.exitCode, 0)
    const combined = out.stdout + out.stderr
    assert.equal(combined.includes('Catalog refreshed'), true)
    assert.equal(combined.includes('react19-patterns'), true)
    const cached = fs.readFileSync(path.join(cacheDir, 'skills/react19-patterns/SKILL.md'), 'utf8')
    assert.equal(cached.includes('Fresh.'), true)
  } finally {
    await stopServer(server)
  }
})

test('haus update --check: reports status JSON, does not run catalog sync', async () => {
  const temp = makeProjectDir()
  const out = await runCli(['update', '--check'], { cwd: temp })
  // --check outputs status JSON (may exit 0 or 1 depending on lock state)
  assert.equal(out.stdout.includes('"ok"'), true)
  // Must NOT include catalog sync output (--check is read-only)
  assert.equal(out.stdout.includes('Syncing remote catalog'), false)
  assert.equal(out.stdout.includes('Update applied'), false)
})

test('apply --write fetches the workflow template from the catalog when cache is empty', async () => {
  // Regression: a fresh install has an empty cache. writeWorkflow must fetch the
  // template from the catalog on demand instead of failing to find it (0.12.0 bug).
  const TEMPLATE_BODY = '# Agentic Development Workflow Standard\n\nMethodology body.\n'
  const { server, port } = await startMockServer({
    '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY },
  })
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-tmpl-cache-'))
  const temp = makeProjectDir()
  fs.writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'tmpl-fetch', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  fs.writeFileSync(path.join(temp, 'yarn.lock'), '# lock')

  try {
    const env = {
      ...process.env,
      HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
      HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
    }
    await runCli(['scan', '--json'], { cwd: temp, env })
    await runCli(['recommend', '--json'], { cwd: temp, env })
    // --allow-empty-cache writes core files (incl. WORKFLOW.md) without catalog items,
    // mirroring the fresh-install init path that triggered the 0.12.0 bug.
    const out = await runCli(['apply', '--write', '--allow-empty-cache'], { cwd: temp, env })
    assert.equal(out.exitCode, 0, `apply failed:\n${out.stdout}\n${out.stderr}`)

    // Template cached from the remote...
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'templates/agentic-workflow-standard.md')),
      true,
      'template not cached from remote',
    )
    // ...and WORKFLOW.md written with the managed header + fetched body.
    const workflow = fs.readFileSync(path.join(temp, '.haus-workflow', 'WORKFLOW.md'), 'utf8')
    assert.equal(workflow.startsWith('<!-- HAUS-MANAGED id=template.workflow'), true)
    assert.equal(workflow.includes('Methodology body.'), true)
  } finally {
    await stopServer(server)
  }
})

test('haus doctor: reports catalog cache absent when override cache dir is empty', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-doc-p8-'))
  fs.mkdirSync(path.join(temp, '.haus-workflow'), { recursive: true })
  fs.writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'doc-p8', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  fs.writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  // Closed-port remote so the on-demand workflow-template fetch fails fast (hermetic).
  const closedPort = await getClosedPort()
  const offline = { ...process.env, HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${closedPort}` }
  await runCli(['scan', '--json'], { cwd: temp, env: offline })
  await runCli(['apply', '--write'], { cwd: temp, env: offline })

  // Fresh empty cache dir — no manifest.json inside
  const emptyCache = mkdtempSync(path.join(os.tmpdir(), 'haus-empty-cache-'))
  const out = await runCli(['doctor'], {
    cwd: temp,
    env: { ...process.env, HAUS_CATALOG_CACHE_DIR_OVERRIDE: emptyCache },
  })
  const combined = out.stdout + out.stderr
  assert.equal(
    combined.includes('CATALOG CACHE: absent'),
    true,
    `expected 'CATALOG CACHE: absent' in:\n${combined}`,
  )
})

test('haus update: caches config items (single-file + directory)', async () => {
  const manifest = {
    version: '1.0.0',
    items: [
      {
        id: 'haus.eslint-config',
        type: 'config',
        source: 'haus',
        path: 'configs/eslint/eslint.config.mjs',
        title: 'Haus ESLint config',
        tags: [],
        repoRoles: [],
        tokenEstimate: 0,
      },
      {
        id: 'haus.prettier-config',
        type: 'config',
        source: 'haus',
        path: 'configs/prettier',
        title: 'Haus Prettier config',
        tags: [],
        repoRoles: [],
        tokenEstimate: 0,
      },
      {
        id: 'haus.empty-config',
        type: 'config',
        source: 'haus',
        path: 'configs/empty/marker',
        title: 'Empty config',
        tags: [],
        repoRoles: [],
        tokenEstimate: 0,
      },
    ],
  }

  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(manifest), contentType: 'application/json' },
    // Single-file item: no tree listing → falls back to a direct fetch.
    '/configs/eslint/eslint.config.mjs': { body: 'export default []\n' },
    // Empty file is valid content, not a fetch failure.
    '/configs/empty/marker': { body: '' },
    // Directory item: tree lists its files, then each is fetched.
    [`/__haus_tree__/${encodeURIComponent('configs/prettier')}`]: {
      body: JSON.stringify(['prettier.config.cjs', '.prettierignore']),
    },
    '/configs/prettier/prettier.config.cjs': { body: 'module.exports = {}\n' },
    '/configs/prettier/.prettierignore': { body: 'dist\n' },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-config-'))
  const temp = makeProjectDir()

  try {
    const out = await runCli(['update'], {
      cwd: temp,
      env: {
        ...process.env,
        HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${port}`,
        HAUS_CATALOG_CACHE_DIR_OVERRIDE: cacheDir,
      },
    })
    assert.equal(out.exitCode, 0, `update failed:\n${out.stdout}\n${out.stderr}`)
    // Config items must no longer be reported as an unknown type.
    assert.equal(
      (out.stdout + out.stderr).includes('is unknown to this haus version'),
      false,
      'config type should be recognized by sync',
    )
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'configs/eslint/eslint.config.mjs')),
      true,
      'single-file config not cached',
    )
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'configs/prettier/prettier.config.cjs')),
      true,
      'directory config file not cached',
    )
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'configs/prettier/.prettierignore')),
      true,
      'directory config dotfile not cached',
    )
    assert.equal(
      fs.existsSync(path.join(cacheDir, 'configs/empty/marker')),
      true,
      'empty single-file config not cached (empty body treated as failure)',
    )
  } finally {
    await stopServer(server)
    fs.rmSync(cacheDir, { recursive: true, force: true })
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

// Security regression: HAUS_CATALOG_REMOTE_BASE must be ignored when HAUS_TEST_MODE is not set.
// Without this gate, a poisoned shell env (CI, direnv, .env) could redirect supply-chain
// fetches to an attacker-controlled server in production builds.
test('HAUS_CATALOG_REMOTE_BASE is ignored in production (no HAUS_TEST_MODE)', async () => {
  const temp = makeProjectDir()
  // Point REMOTE_BASE at a closed port so any fetch attempt immediately fails.
  const closedPort = await getClosedPort()
  const out = await runCli(['update'], {
    cwd: temp,
    env: {
      ...process.env,
      // Explicitly unset HAUS_TEST_MODE to simulate a production environment.
      HAUS_TEST_MODE: '',
      NODE_ENV: '',
      HAUS_CATALOG_REMOTE_BASE: `http://127.0.0.1:${closedPort}`,
    },
  })
  // The CLI must not have used the poisoned base — it should exit 0 (offline fallback to
  // bundled ref) rather than 1 (connection refused from an honoured REMOTE_BASE).
  // If REMOTE_BASE were honoured, the fetch would hit the closed port and the manifest
  // fetch would fail; but the command still exits 0 because remoteBase() falls through to
  // the real GitHub URL (which also fails in this offline test, triggering the same
  // offline-fallback path). The key invariant: the closed-port URL is NOT used as the base.
  //
  // We verify by checking that stdout/stderr does NOT contain the attacker URL as a
  // referenced host — the CLI should only reference the real GitHub domain or nothing.
  const combined = out.stdout + out.stderr
  assert.equal(
    combined.includes(`127.0.0.1:${closedPort}`),
    false,
    'HAUS_CATALOG_REMOTE_BASE must be ignored when HAUS_TEST_MODE is unset — poisoned env should not redirect fetches',
  )
})
