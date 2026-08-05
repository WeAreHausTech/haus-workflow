import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveGithubAuthToken,
  getGithubApiHeaders,
  _resetGithubAuthCacheForTests,
  _setGhTokenResolverForTests,
} from '../src/catalog/remote-catalog/github-auth.js'

function clearTokenEnv() {
  delete process.env['HAUS_GITHUB_TOKEN']
  delete process.env['GITHUB_TOKEN']
}

test('resolveGithubAuthToken prefers HAUS_GITHUB_TOKEN over GITHUB_TOKEN and gh', async () => {
  _resetGithubAuthCacheForTests()
  _setGhTokenResolverForTests(async () => 'from-gh')
  process.env['HAUS_GITHUB_TOKEN'] = 'haus-tok'
  process.env['GITHUB_TOKEN'] = 'github-tok'
  try {
    assert.equal(await resolveGithubAuthToken(), 'haus-tok')
    const headers = await getGithubApiHeaders()
    assert.equal(headers['Authorization'], 'Bearer haus-tok')
  } finally {
    clearTokenEnv()
    _setGhTokenResolverForTests(undefined)
    _resetGithubAuthCacheForTests()
  }
})

test('resolveGithubAuthToken prefers GITHUB_TOKEN over gh when HAUS unset', async () => {
  _resetGithubAuthCacheForTests()
  _setGhTokenResolverForTests(async () => 'from-gh')
  clearTokenEnv()
  process.env['GITHUB_TOKEN'] = 'github-tok'
  try {
    assert.equal(await resolveGithubAuthToken(), 'github-tok')
  } finally {
    clearTokenEnv()
    _setGhTokenResolverForTests(undefined)
    _resetGithubAuthCacheForTests()
  }
})

test('resolveGithubAuthToken falls back to gh auth token', async () => {
  _resetGithubAuthCacheForTests()
  clearTokenEnv()
  _setGhTokenResolverForTests(async () => 'from-gh')
  try {
    assert.equal(await resolveGithubAuthToken(), 'from-gh')
    const headers = await getGithubApiHeaders()
    assert.equal(headers['Authorization'], 'Bearer from-gh')
  } finally {
    _setGhTokenResolverForTests(undefined)
    _resetGithubAuthCacheForTests()
  }
})

test('resolveGithubAuthToken returns null when env and gh missing', async () => {
  _resetGithubAuthCacheForTests()
  clearTokenEnv()
  _setGhTokenResolverForTests(async () => null)
  try {
    assert.equal(await resolveGithubAuthToken(), null)
    const headers = await getGithubApiHeaders()
    assert.equal(headers['Authorization'], undefined)
    assert.equal(headers['Accept'], 'application/vnd.github+json')
  } finally {
    _setGhTokenResolverForTests(undefined)
    _resetGithubAuthCacheForTests()
  }
})

test('resolveGithubAuthToken caches per process', async () => {
  _resetGithubAuthCacheForTests()
  clearTokenEnv()
  let calls = 0
  _setGhTokenResolverForTests(async () => {
    calls++
    return 'once'
  })
  try {
    assert.equal(await resolveGithubAuthToken(), 'once')
    assert.equal(await resolveGithubAuthToken(), 'once')
    assert.equal(calls, 1)
  } finally {
    _setGhTokenResolverForTests(undefined)
    _resetGithubAuthCacheForTests()
  }
})
