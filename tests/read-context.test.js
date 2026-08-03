import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { readContextOrScan } from '../src/scanner/read-context.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-read-context-'))
  fs.mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeCache(repoName) {
  const cachePath = path.join(tmpDir, '.haus-workflow', 'context-map.json')
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      mode: 'fast',
      generatedAt: new Date().toISOString(),
      root: tmpDir,
      repoName,
      packageManager: 'yarn',
      repoRoles: [],
      confidence: 0.5,
      detectedStacks: {
        frontend: [],
        backend: [],
        databases: [],
        testing: [],
        auth: [],
        tooling: [],
        packageManagers: [],
      },
      dependencies: [],
      securityRisks: [],
      crossRepoHints: [],
      warnings: [],
    }),
  )
  return cachePath
}

test('returns the cache when package.json is older than the cached context', async () => {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"old"}', 'utf8')
  const pkgTime = new Date(Date.now() - 60_000)
  fs.utimesSync(path.join(tmpDir, 'package.json'), pkgTime, pkgTime)

  const cachePath = writeCache('cached-repo-name')
  const cacheTime = new Date()
  fs.utimesSync(cachePath, cacheTime, cacheTime)

  const result = await readContextOrScan(tmpDir)
  assert.equal(result.repoName, 'cached-repo-name', 'must use the cache, not rescan')
})

test('rescans when package.json is newer than the cached context', async () => {
  const cachePath = writeCache('stale-cached-name')
  const cacheTime = new Date(Date.now() - 60_000)
  fs.utimesSync(cachePath, cacheTime, cacheTime)

  // package.json's mtime defaults to "now", i.e. after cacheTime — no utimes needed.
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fresh-project"}', 'utf8')

  const result = await readContextOrScan(tmpDir)
  assert.notEqual(result.repoName, 'stale-cached-name', 'must rescan, not return the stale cache')
})

test('falls back to the cache when there is no package.json to compare against', async () => {
  const cachePath = writeCache('cached-repo-name')
  fs.utimesSync(cachePath, new Date(), new Date())
  const result = await readContextOrScan(tmpDir)
  assert.equal(result.repoName, 'cached-repo-name')
})
