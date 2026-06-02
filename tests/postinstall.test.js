import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { execaSync } from 'execa'

import { shouldRunPostinstall } from '../scripts/postinstall.mjs'

// ---- gate matrix ------------------------------------------------------------

const GLOBAL_OK = { npm_config_global: 'true' }

describe('postinstall: shouldRunPostinstall', () => {
  it('runs on a clean global install', () => {
    const d = shouldRunPostinstall({ env: { ...GLOBAL_OK }, distExists: true, srcExists: false })
    assert.equal(d.run, true)
  })

  it('skips a non-global (local) install', () => {
    const d = shouldRunPostinstall({ env: {}, distExists: true, srcExists: false })
    assert.equal(d.run, false)
    assert.match(d.reason, /global/)
  })

  it('skips in CI', () => {
    const d = shouldRunPostinstall({
      env: { ...GLOBAL_OK, CI: 'true' },
      distExists: true,
      srcExists: false,
    })
    assert.equal(d.run, false)
    assert.match(d.reason, /CI/)
  })

  it('skips when HAUS_NO_POSTINSTALL=1', () => {
    const d = shouldRunPostinstall({
      env: { ...GLOBAL_OK, HAUS_NO_POSTINSTALL: '1' },
      distExists: true,
      srcExists: false,
    })
    assert.equal(d.run, false)
    assert.match(d.reason, /HAUS_NO_POSTINSTALL/)
  })

  it('skips when dist/cli.js is missing', () => {
    const d = shouldRunPostinstall({ env: { ...GLOBAL_OK }, distExists: false, srcExists: false })
    assert.equal(d.run, false)
    assert.match(d.reason, /dist/)
  })

  it('skips inside the package dev checkout (src present)', () => {
    const d = shouldRunPostinstall({ env: { ...GLOBAL_OK }, distExists: true, srcExists: true })
    assert.equal(d.run, false)
    assert.match(d.reason, /dev checkout/)
  })
})

// ---- notice -----------------------------------------------------------------

describe('postinstall: install --postinstall notice', () => {
  it('prints what changed plus undo + disable instructions', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-postinstall-'))
    const r = execaSync('node', [path.resolve('dist/cli.js'), 'install', '--postinstall'], {
      env: { ...process.env, HOME: tmp, USERPROFILE: tmp },
      reject: false,
    })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    assert.match(out, /haus configured Claude Code for you/)
    assert.match(out, /~\/\.claude\/settings\.json/)
    assert.match(out, /haus uninstall/)
    assert.match(out, /HAUS_NO_POSTINSTALL=1/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

// ---- package.json wiring ----------------------------------------------------

describe('postinstall: package.json wiring', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))

  it('registers the postinstall script with a non-fatal guard', () => {
    assert.equal(pkg.scripts.postinstall, 'node ./scripts/postinstall.mjs || true')
  })

  it('makes prepare non-fatal so git-install consumers do not crash', () => {
    assert.match(pkg.scripts.prepare, /\|\| true$/)
  })

  it('ships scripts/postinstall.mjs in the published files list', () => {
    assert.ok(pkg.files.includes('scripts/postinstall.mjs'))
  })
})
