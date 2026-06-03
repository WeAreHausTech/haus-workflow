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
      references: [
        'references/conventions.md',
        'references/scope.md',
        'https://react.dev/',
      ],
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

function startMockServer(handlers) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url ?? '/'
      const handler = handlers[url]
      if (handler) {
        const { status = 200, body } = handler
        res.writeHead(status, { 'Content-Type': 'application/json' })
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
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST) },
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

test('haus update: no duplicate downloads for already-cached items', async () => {
  const { server, port } = await startMockServer({
    '/manifest.json': { body: JSON.stringify(FIXTURE_MANIFEST) },
    '/skills/react19-patterns/SKILL.md': { body: FIXTURE_SKILL_MD },
    '/agents/code-reviewer.md': { body: FIXTURE_AGENT_MD },
  })

  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-cache-nodup-'))
  const temp = makeProjectDir()

  // Pre-populate the skill so it appears already cached
  fs.mkdirSync(path.join(cacheDir, 'skills/react19-patterns/references'), { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/SKILL.md'), FIXTURE_SKILL_MD)
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/references/conventions.md'), 'x')
  fs.writeFileSync(path.join(cacheDir, 'skills/react19-patterns/references/scope.md'), 'x')

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
    // Only agent should be new; skill was already cached
    if (combined.includes('new item')) {
      assert.equal(combined.includes('code-reviewer-agent'), true, 'agent should be new')
      assert.equal(combined.includes('react19-patterns'), false, 'skill should NOT be new')
    }
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
