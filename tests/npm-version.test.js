import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchNpmVersionStatus } from '../src/update/npm-version.js'

test('fetchNpmVersionStatus reports update available when latest is newer', async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ version: '0.99.0' }),
    })
  try {
    const status = await fetchNpmVersionStatus('0.27.0')
    assert.equal(status.latest, '0.99.0')
    assert.equal(status.updateAvailable, true)
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('fetchNpmVersionStatus reports no update when versions are equal', async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ version: '0.27.0' }),
    })
  try {
    const status = await fetchNpmVersionStatus('0.27.0')
    assert.equal(status.latest, '0.27.0')
    assert.equal(status.updateAvailable, false)
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('fetchNpmVersionStatus returns latest:null on network failure', async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('offline')
  }
  try {
    const status = await fetchNpmVersionStatus('0.27.0')
    assert.equal(status.latest, null)
    assert.equal(status.updateAvailable, false)
  } finally {
    globalThis.fetch = prevFetch
  }
})
