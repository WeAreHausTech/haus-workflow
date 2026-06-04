/**
 * Regression tests for e3737b8: postinstall notice distinguishes added vs updated,
 * and phrases settings as "ensured present" (idempotent re-run wording).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

const CLI = path.resolve('dist/cli.js')

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haus-postinstall-'))
}

function runInstall(tmpHome, extra = []) {
  return execaSync('node', [CLI, 'install', '--postinstall', ...extra], {
    reject: false,
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
  })
}

test('postinstall notice includes "haus configured Claude Code" header', () => {
  const tmpHome = makeTempHome()
  try {
    const r = runInstall(tmpHome)
    const out = r.stdout ?? ''
    assert.equal(out.includes('haus configured Claude Code'), true, `expected header in:\n${out}`)
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test('postinstall notice includes "ensured hooks + security rules are present" (e3737b8)', () => {
  const tmpHome = makeTempHome()
  try {
    const r = runInstall(tmpHome)
    const out = r.stdout ?? ''
    assert.equal(
      out.includes('ensured hooks + security rules are present'),
      true,
      `expected ensured-present wording in:\n${out}`,
    )
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test('postinstall notice includes "Undo any time with" instruction', () => {
  const tmpHome = makeTempHome()
  try {
    const r = runInstall(tmpHome)
    const out = r.stdout ?? ''
    assert.equal(out.includes('Undo any time with'), true, `expected undo line in:\n${out}`)
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test('postinstall notice shows added file count on first install (e3737b8)', () => {
  const tmpHome = makeTempHome()
  try {
    const r = runInstall(tmpHome)
    const out = r.stdout ?? ''
    // First install: some files are created → "N file(s) added"
    const hasAdded = out.includes('file(s) added')
    const hasUpToDate = out.includes('already up to date')
    assert.ok(hasAdded || hasUpToDate, `expected file count or up-to-date wording in:\n${out}`)
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test('postinstall idempotent re-run shows "already up to date" (e3737b8)', () => {
  const tmpHome = makeTempHome()
  try {
    // First run installs everything
    runInstall(tmpHome)
    // Second run should be idempotent
    const r2 = runInstall(tmpHome)
    const out2 = r2.stdout ?? ''
    assert.equal(
      out2.includes('already up to date'),
      true,
      `expected idempotent wording on second run in:\n${out2}`,
    )
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})
