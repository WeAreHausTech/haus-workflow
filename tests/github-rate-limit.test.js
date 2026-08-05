import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatGithubRateLimitMessage,
  isGithubRateLimitedResponse,
  noteGithubRateLimit,
  getGithubRateLimitHit,
  clearGithubRateLimitHit,
} from '../src/catalog/remote-catalog/github-rate-limit.js'

test('isGithubRateLimitedResponse true for 403 with remaining 0', () => {
  const res = {
    status: 403,
    headers: { get: (k) => (k.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null) },
  }
  assert.equal(isGithubRateLimitedResponse(res), true)
})

test('isGithubRateLimitedResponse true for 429 with Retry-After', () => {
  const res = {
    status: 429,
    headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '60' : null) },
  }
  assert.equal(isGithubRateLimitedResponse(res), true)
})

test('isGithubRateLimitedResponse false for 403 with remaining > 0', () => {
  const res = {
    status: 403,
    headers: { get: (k) => (k.toLowerCase() === 'x-ratelimit-remaining' ? '10' : null) },
  }
  assert.equal(isGithubRateLimitedResponse(res), false)
})

test('isGithubRateLimitedResponse false for 500', () => {
  const res = {
    status: 500,
    headers: { get: () => null },
  }
  assert.equal(isGithubRateLimitedResponse(res), false)
})

test('noteGithubRateLimit captures resetAt and authenticated', () => {
  clearGithubRateLimitHit()
  const res = {
    status: 403,
    headers: {
      get: (k) => {
        const key = k.toLowerCase()
        if (key === 'x-ratelimit-remaining') return '0'
        if (key === 'x-ratelimit-reset') return '1785908480'
        return null
      },
    },
  }
  noteGithubRateLimit(res, false)
  assert.deepEqual(getGithubRateLimitHit(), { resetAt: 1785908480, authenticated: false })
  clearGithubRateLimitHit()
  assert.equal(getGithubRateLimitHit(), undefined)
})

test('noteGithubRateLimit keeps earliest resetAt across hits', () => {
  clearGithubRateLimitHit()
  const later = {
    status: 403,
    headers: {
      get: (k) => {
        const key = k.toLowerCase()
        if (key === 'x-ratelimit-remaining') return '0'
        if (key === 'x-ratelimit-reset') return '1785909000'
        return null
      },
    },
  }
  const earlier = {
    status: 429,
    headers: {
      get: (k) => {
        const key = k.toLowerCase()
        if (key === 'retry-after') return '30'
        if (key === 'x-ratelimit-reset') return '1785908000'
        return null
      },
    },
  }
  noteGithubRateLimit(later, false)
  noteGithubRateLimit(earlier, true)
  assert.deepEqual(getGithubRateLimitHit(), { resetAt: 1785908000, authenticated: true })
  clearGithubRateLimitHit()
})

test('formatGithubRateLimitMessage unauthenticated includes token fix', () => {
  const msg = formatGithubRateLimitMessage({ resetAt: null, authenticated: false })
  assert.match(msg, /rate limit exceeded/i)
  assert.match(msg, /GITHUB_TOKEN/)
  assert.match(msg, /gh auth token/)
  assert.match(msg, /token still recommended/i)
})

test('formatGithubRateLimitMessage authenticated omits export instructions', () => {
  const msg = formatGithubRateLimitMessage({ resetAt: 1785908480, authenticated: true })
  assert.match(msg, /rate limit/i)
  assert.doesNotMatch(msg, /export GITHUB_TOKEN/)
  assert.match(msg, /wait until/i)
})
