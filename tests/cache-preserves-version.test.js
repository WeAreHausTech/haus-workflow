import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const MANIFEST = {
  version: '3.0.0',
  items: [
    {
      id: 'haus.tiny',
      type: 'agent',
      source: 'haus',
      path: 'agents/tiny.md',
      title: 'Tiny',
      tags: [],
      repoRoles: [],
      tokenEstimate: 10,
    },
  ],
}

const { server, port } = await new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(MANIFEST))
      return
    }
    if (url === '/agents/tiny.md') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(
        '---\ndescription: Tiny\n---\n## Use when\nx\n## Do not use when\ny\n## Verification\nz\n',
      )
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  srv.listen(0, '127.0.0.1', () => {
    const { port: p } = srv.address()
    resolve({ server: srv, port: p })
  })
})

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-cache-ver-'))
const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
const prevCache = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
process.env.HAUS_CATALOG_REMOTE_BASE = `http://127.0.0.1:${port}`
process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = cacheDir

const { syncRemoteCatalog } = await import('../src/catalog/remote-catalog.js')

after(() => {
  server.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
  else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  if (prevCache === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCache
})

test('cached manifest preserves top-level version', async () => {
  await syncRemoteCatalog()
  const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'))
  assert.equal(cache.version, '3.0.0')
})
