import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const TEMPLATE_BODY = '# Agentic Development Workflow Standard\n\nMethodology body.\n'

let mockHandlers = {
  '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY },
}

const sharedCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-cache-'))

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

const prevRemoteBase = process.env.HAUS_CATALOG_REMOTE_BASE
const prevCacheDir = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
process.env.HAUS_CATALOG_REMOTE_BASE = `http://127.0.0.1:${sharedPort}`
process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = sharedCacheDir

const { writeWorkflow } = await import('../src/claude/write-workflow.js')

after(() => {
  sharedServer.close()
  fs.rmSync(sharedCacheDir, { recursive: true, force: true })
  if (prevRemoteBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
  else process.env.HAUS_CATALOG_REMOTE_BASE = prevRemoteBase
  if (prevCacheDir === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCacheDir
})

async function setupTampered(root) {
  fs.mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
  const tampered =
    '<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 hash=sha256-deadbeef -->\nUSER EDITED BODY\n'
  fs.writeFileSync(path.join(root, '.haus-workflow', 'WORKFLOW.md'), tampered, 'utf8')
}

test('writeWorkflow skips a user-modified file without force', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-'))
  try {
    await setupTampered(root)
    const result = await writeWorkflow(root, '0.18.2', false, false)
    assert.equal(result, null)
    const after = fs.readFileSync(path.join(root, '.haus-workflow', 'WORKFLOW.md'), 'utf8')
    assert.match(after, /USER EDITED BODY/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow overwrites a user-modified file with force', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-'))
  try {
    await setupTampered(root)
    await writeWorkflow(root, '0.18.2', false, true)
    const after = fs.readFileSync(path.join(root, '.haus-workflow', 'WORKFLOW.md'), 'utf8')
    assert.doesNotMatch(after, /USER EDITED BODY/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow migrates legacy hash header and preserves user body (no --force)', async () => {
  // A file written by an older haus with a missing/legacy hash but user-edited body
  // should have its header migrated (hash added) while the user body is preserved.
  // This is the A8 regression: previously this skipped entirely (returned null).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-'))
  try {
    fs.mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
    // Legacy header: has id and v but no hash field (unrecognised/missing format)
    const legacyHeader =
      '<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 -->\nUSER BODY\n'
    const workflowPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')
    fs.writeFileSync(workflowPath, legacyHeader, 'utf8')

    // Without --force: should migrate header, preserve user body (not skip)
    const result = await writeWorkflow(root, '0.18.2', false, false)
    assert.equal(result, workflowPath, 'should return destPath (not null) after header migration')

    const after = fs.readFileSync(workflowPath, 'utf8')
    // User body must be preserved
    assert.match(after, /USER BODY/, 'user body must be preserved after header migration')
    // Header must now include a hash (migrated to current format)
    const newFirstLine = after.split('\n')[0]
    assert.match(newFirstLine, /hash=sha256-[a-f0-9]{64}/, 'migrated header must contain a sha256 hash')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow with legacy hash header and matching body rewrites to current template', async () => {
  // Legacy header + body that still matches the current template → rewrite both header and body
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-'))
  try {
    fs.mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
    // Header without hash, body is the current template content
    const legacyHeader =
      `<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 -->\n${TEMPLATE_BODY}`
    const workflowPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')
    fs.writeFileSync(workflowPath, legacyHeader, 'utf8')

    const result = await writeWorkflow(root, '0.18.2', false, false)
    assert.equal(result, workflowPath, 'should return destPath when body matches template')

    const after = fs.readFileSync(workflowPath, 'utf8')
    const newFirstLine = after.split('\n')[0]
    assert.match(newFirstLine, /hash=sha256-[a-f0-9]{64}/, 'header must be updated with sha256 hash')
    assert.match(after, /Methodology body\./, 'template body must be present')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeWorkflow overwrites legacy-hash file with force', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-force-'))
  try {
    fs.mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
    const legacyHeader =
      '<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 -->\nUSER BODY\n'
    const workflowPath = path.join(root, '.haus-workflow', 'WORKFLOW.md')
    fs.writeFileSync(workflowPath, legacyHeader, 'utf8')

    await writeWorkflow(root, '0.18.2', false, true)
    const overwritten = fs.readFileSync(workflowPath, 'utf8')
    assert.doesNotMatch(overwritten, /USER BODY/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
