import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { parseHausManagedHeader } from '../src/claude/managed-template.js'

const TEMPLATE_BODY = '# Agentic Development Workflow Standard\n\nMethodology body.\n'

let mockHandlers = {
  '/templates/agentic-workflow-standard.md': { body: TEMPLATE_BODY },
}

const sharedCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-mtv-cache-'))

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

test('parseHausManagedHeader captures v and source', () => {
  const header =
    '<!-- HAUS-MANAGED id=workflow.standard v=2 source=@haus-tech/haus-workflow@0.18.2 hash=sha256-abc123 -->'
  const parsed = parseHausManagedHeader(header)
  assert.equal(parsed?.id, 'workflow.standard')
  assert.equal(parsed?.v, 2)
  assert.equal(parsed?.source, '@haus-tech/haus-workflow@0.18.2')
  assert.equal(parsed?.hash, 'sha256-abc123')
})

test('writeWorkflow refuses to overwrite a file written by a newer CLI (marker v > SCHEMA_VERSION)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-fwd-'))
  try {
    fs.mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
    const future =
      '<!-- HAUS-MANAGED id=template.workflow v=999 source=@haus-tech/haus-workflow@9.9.9 hash=sha256-abc -->\nNEWER FORMAT\n'
    fs.writeFileSync(path.join(root, '.haus-workflow', 'WORKFLOW.md'), future, 'utf8')

    const result = await writeWorkflow(root, '0.18.2', false, true)
    assert.equal(result, null)
    const after = fs.readFileSync(path.join(root, '.haus-workflow', 'WORKFLOW.md'), 'utf8')
    assert.match(after, /NEWER FORMAT/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
