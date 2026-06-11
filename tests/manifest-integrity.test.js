import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
let server
let port

await new Promise((resolve) => {
  server = http.createServer((req, res) => {
    if (req.url === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ version: '1.0.0', items: [{ id: 'x', type: 'skill' }] }))
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port
    process.env.HAUS_CATALOG_REMOTE_BASE = `http://127.0.0.1:${port}`
    resolve()
  })
})

const { fetchRemoteManifest } = await import('../src/catalog/remote-catalog.js')

after(() => {
  server.close()
  if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
  else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
})

test('fetchRemoteManifest returns null on a schema-invalid manifest', async () => {
  const result = await fetchRemoteManifest()
  assert.equal(result, null)
})
