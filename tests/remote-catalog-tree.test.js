import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const FIXTURE_MANIFEST = {
  version: '1.0.0',
  items: [
    {
      id: 'haus.superpowers-brainstorming',
      type: 'skill',
      source: 'curated',
      reviewStatus: 'approved',
      riskLevel: 'low',
      path: 'skills/superpowers/brainstorming',
      title: 'Brainstorming',
      tags: ['workflow'],
      repoRoles: [],
      tokenEstimate: 100,
      originSourceId: 'superpowers-pcvelz',
    },
  ],
}

const SKILL_MD =
  '---\ndescription: Brainstorm first.\n---\nSee skills/shared/task-format-reference.md\n'
const SHARED_MD = '# Task format reference\n'

const { server, port } = await new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(FIXTURE_MANIFEST))
      return
    }
    if (url === `/__haus_tree__/${encodeURIComponent('skills/superpowers/brainstorming')}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(['SKILL.md', 'scripts/helper.js']))
      return
    }
    if (url === `/__haus_tree__/${encodeURIComponent('skills/superpowers/shared')}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(['task-format-reference.md']))
      return
    }
    if (url === '/skills/superpowers/brainstorming/SKILL.md') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(SKILL_MD)
      return
    }
    if (url === '/skills/superpowers/brainstorming/scripts/helper.js') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('export const ok = true;\n')
      return
    }
    if (url === '/skills/superpowers/shared/task-format-reference.md') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(SHARED_MD)
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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-rc-tree-'))
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

test('syncRemoteCatalog caches full skill trees and superpowers shared', async () => {
  const result = await syncRemoteCatalog()
  assert.equal(result.failed.length, 0)
  assert.equal(
    fs.existsSync(path.join(cacheDir, 'skills/superpowers/brainstorming/scripts/helper.js')),
    true,
  )
  assert.equal(
    fs.existsSync(path.join(cacheDir, 'skills/superpowers/shared/task-format-reference.md')),
    true,
  )
})
