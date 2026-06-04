/**
 * Tests for src/claude/write-workflow.ts
 *
 * IMPORTANT: remote-catalog.ts resolves CACHE_DIR and REMOTE_BASE at module load time.
 * These env vars MUST be set before the first import of write-workflow / remote-catalog.
 * We use top-level await to start the mock server, set env vars, then dynamically import.
 * The server stays alive for all tests and is closed in the node:test after() hook.
 * Previous env var values are captured and restored in the same after() hook.
 */

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Shared mock server — started before any imports so env vars are set in time
// ---------------------------------------------------------------------------

const TEMPLATE_BODY = '# Agentic Development Workflow Standard\n\nMethodology body.\n'

/**
 * Mutable handler registry. Tests replace this to control server responses.
 * Default: serve the workflow template.
 */
let mockHandlers = {
  '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY },
}

const sharedCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-ww-shared-cache-'))

const { sharedServer, sharedPort } = await new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/'
    const handler = mockHandlers[url]
    if (handler) {
      const { status = 200, body } = handler
      res.writeHead(status, { 'Content-Type': 'text/plain' })
      res.end(body)
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    resolve({ sharedServer: server, sharedPort: port })
  })
})

// Capture previous values so we can restore them after all tests complete
const prevRemoteBase = process.env.HAUS_CATALOG_REMOTE_BASE
const prevCacheDir = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE

// Set env vars before importing remote-catalog / write-workflow
process.env.HAUS_CATALOG_REMOTE_BASE = `http://127.0.0.1:${sharedPort}`
process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = sharedCacheDir

// Dynamic import so that module-level constants in remote-catalog.ts pick up the env vars
const { makeWorkflowHeader, writeWorkflow } = await import('../src/claude/write-workflow.js')

// Close server and restore env vars after all tests complete
after(() => {
  sharedServer.close()
  fs.rmSync(sharedCacheDir, { recursive: true, force: true })
  if (prevRemoteBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
  else process.env.HAUS_CATALOG_REMOTE_BASE = prevRemoteBase
  if (prevCacheDir === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCacheDir
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-ww-root-'))
  fs.mkdirSync(path.join(dir, '.haus-workflow'), { recursive: true })
  return dir
}

/** Remove the cached template so the next test is forced to fetch from the server. */
function clearTemplateCache() {
  const cached = path.join(sharedCacheDir, 'templates/agentic-workflow-standard.md')
  if (fs.existsSync(cached)) fs.rmSync(cached)
}

// ---------------------------------------------------------------------------
// makeWorkflowHeader — pure function, no I/O
// ---------------------------------------------------------------------------

test('makeWorkflowHeader embeds version and hash', () => {
  const result = makeWorkflowHeader('0.13.0', 'sha256-abc123')
  assert.ok(result.startsWith('<!-- HAUS-MANAGED id=template.workflow'))
  assert.ok(result.includes('source=@haus-tech/haus-workflow@0.13.0'))
  assert.ok(result.includes('hash=sha256-abc123'))
  assert.ok(result.endsWith('-->'))
})

// ---------------------------------------------------------------------------
// writeWorkflow — async, uses shared mock server
// ---------------------------------------------------------------------------

test('writeWorkflow writes WORKFLOW.md with managed header', async () => {
  clearTemplateCache()
  mockHandlers = { '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY } }

  const root = makeTmpRoot()
  try {
    const result = await writeWorkflow(root, '0.13.0', false)
    const destPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')

    assert.ok(fs.existsSync(destPath), 'WORKFLOW.md should exist')
    const content = fs.readFileSync(destPath, 'utf8')
    const firstLine = content.split('\n')[0]
    assert.ok(
      firstLine.startsWith('<!-- HAUS-MANAGED id=template.workflow'),
      'first line should be managed header',
    )
    assert.ok(content.includes('Methodology body.'), 'file should contain template body')
    assert.equal(result, destPath)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow skips when content unchanged (already up to date)', async () => {
  clearTemplateCache()
  mockHandlers = { '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY } }

  const root = makeTmpRoot()
  try {
    // First write
    await writeWorkflow(root, '0.13.0', false)
    // Second write — same template content; cache now has the file
    const result = await writeWorkflow(root, '0.13.0', false)
    const destPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')

    // Returns the dest path (not null) — idempotent, no error
    assert.equal(result, destPath)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow detects user modification and skips (tamper detection)', async () => {
  clearTemplateCache()
  mockHandlers = { '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY } }

  const root = makeTmpRoot()
  try {
    // Write once so the header + hash are recorded
    await writeWorkflow(root, '0.13.0', false)

    const destPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')
    const written = fs.readFileSync(destPath, 'utf8')
    // Keep the managed header line but replace the body so the hash no longer matches
    const headerLine = written.split('\n')[0]
    const tampered = headerLine + '\nUser-modified content that changes the hash.\n'
    fs.writeFileSync(destPath, tampered, 'utf8')

    // Second write should detect the tamper and return null
    const result = await writeWorkflow(root, '0.13.0', false)
    assert.equal(result, null, 'should return null when content is user-modified')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow dry-run does not write to disk', async () => {
  clearTemplateCache()
  mockHandlers = { '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY } }

  const root = makeTmpRoot()
  try {
    await writeWorkflow(root, '0.13.0', true)

    const destPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')
    assert.ok(!fs.existsSync(destPath), 'WORKFLOW.md should NOT be written in dry-run')

    // Regression: dry-run must not cache the template (fix 6744f94)
    const cachedTemplate = path.join(sharedCacheDir, 'templates/agentic-workflow-standard.md')
    assert.ok(!fs.existsSync(cachedTemplate), 'template should NOT be cached in dry-run')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow returns null when template unavailable (404)', async () => {
  clearTemplateCache()
  // No handler for the template — server will return 404
  mockHandlers = {}

  const root = makeTmpRoot()
  try {
    const result = await writeWorkflow(root, '0.13.0', false)
    assert.equal(result, null, 'should return null when template fetch returns 404')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    // Restore default handler
    mockHandlers = { '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY } }
  }
})
