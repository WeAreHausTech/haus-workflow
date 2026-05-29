import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execaSync } from 'execa'

test('cli --version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  const cli = path.resolve('dist/cli.js')
  const r = execaSync('node', [cli, '--version'], { reject: false })
  assert.equal(r.exitCode, 0)
  assert.equal((r.stdout ?? '').trim(), pkg.version)
})
