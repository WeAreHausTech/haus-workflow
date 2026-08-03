import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'

import { detectPackageManager } from '../src/scanner/detect-package-manager.js'

// Direct unit coverage for package-manager resolution (audit CLI §7: previously
// untested for corepack build-metadata suffixes and a malformed packageManager
// field — both silently fall through to lockfile sniffing today).

test('detects yarn from an in-range packageManager field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'yarn@4.1.0'), 'yarn')
})

test('detects pnpm from an in-range packageManager field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'pnpm@8.9.0'), 'pnpm')
})

test('detects npm from an in-range packageManager field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'npm@9.5.0'), 'npm')
})

test('rejects an out-of-range yarn version instead of trusting the field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'yarn@1.22.19'), 'unknown')
})

test('rejects an out-of-range pnpm version instead of trusting the field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'pnpm@10.0.0'), 'unknown')
})

test('an out-of-range field returns unknown even when a valid lockfile is present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8')
  assert.equal(
    detectPackageManager(dir, 'yarn@1.22.19'),
    'unknown',
    'an explicit but unsupported field version must not fall back to lockfile sniffing',
  )
})

test('strips a corepack build-metadata suffix before range-checking (yarn)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(
    detectPackageManager(dir, 'yarn@4.1.0+sha256.abcdef0123456789'),
    'yarn',
    'corepack-style +hash suffix must not defeat the version-range check',
  )
})

test('strips a corepack build-metadata suffix before range-checking (pnpm)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'pnpm@8.9.0+sha1.deadbeef'), 'pnpm')
})

test('a build-metadata suffix cannot rescue an out-of-range version', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir, 'yarn@1.22.19+sha256.abcdef'), 'unknown')
})

test('falls back to lockfile sniffing when the field is malformed', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf8')
  assert.equal(
    detectPackageManager(dir, 'not-a-valid-field'),
    'pnpm',
    'a malformed field must fall back to lockfile sniffing, not throw or misreport',
  )
})

test('falls back to lockfile sniffing when the field is an empty string', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8')
  assert.equal(detectPackageManager(dir, ''), 'yarn')
})

test('falls back to lockfile sniffing when the field is undefined', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'package-lock.json'), '{}', 'utf8')
  assert.equal(detectPackageManager(dir), 'npm')
})

test('lockfile precedence: yarn.lock wins over pnpm-lock.yaml when both present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8')
  writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf8')
  assert.equal(detectPackageManager(dir), 'yarn')
})

test('lockfile precedence: pnpm-lock.yaml wins over package-lock.json when both present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf8')
  writeFileSync(path.join(dir, 'package-lock.json'), '{}', 'utf8')
  assert.equal(detectPackageManager(dir), 'pnpm')
})

test('returns unknown when no field and no lockfile are present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haus-detect-pm-'))
  assert.equal(detectPackageManager(dir), 'unknown')
})
