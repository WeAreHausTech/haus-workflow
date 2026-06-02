import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanProject } from '../src/scanner/scan-project.ts'

const REPOS = path.resolve(new URL('./fixtures/repos', import.meta.url).pathname)

/** Copy a fixture (or build a fresh dir) into a temp dir so scan artifacts stay hermetic. */
function tmpFrom(fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-status-`))
  if (fixture) fs.cpSync(path.join(REPOS, fixture), tmp, { recursive: true })
  return tmp
}

test('python-only repo is detectionStatus=unknown with a python signal', async () => {
  const tmp = tmpFrom('python-only')
  const r = await scanProject(tmp, 'fast')
  assert.equal(r.detectionStatus, 'unknown')
  assert.deepEqual(r.unsupportedSignals, ['python'])
  assert.deepEqual(r.repoRoles, [])
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('a recognised JS repo is detectionStatus=supported with no unsupported signals', async () => {
  const tmp = tmpFrom('nextjs-app')
  const r = await scanProject(tmp, 'fast')
  assert.equal(r.detectionStatus, 'supported')
  assert.deepEqual(r.unsupportedSignals, [])
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('a recognised repo with an unsupported marker is detectionStatus=partial', async () => {
  // Next.js app + a Cargo.toml marker → recognised stack coexists with an unsupported one.
  const tmp = tmpFrom('nextjs-app')
  fs.writeFileSync(path.join(tmp, 'Cargo.toml'), '[package]\nname = "x"\n')
  const r = await scanProject(tmp, 'fast')
  assert.equal(r.detectionStatus, 'partial')
  assert.deepEqual(r.unsupportedSignals, ['rust'])
  fs.rmSync(tmp, { recursive: true, force: true })
})
