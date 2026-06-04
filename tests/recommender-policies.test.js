import test from 'node:test'
import assert from 'node:assert/strict'

import {
  matchRequiresAny,
  mergeRecommendationWarnings,
  describeRequiresAny,
} from '../src/recommender/policies.js'

// matchRequiresAny

test('matchRequiresAny: empty clauses returns not matched', () => {
  const ctx = { stackSet: new Set(['nextjs']), depSet: new Set(), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([], ctx), { matched: false })
})

test('matchRequiresAny: stack clause matches when stackSet contains the stack', () => {
  const ctx = { stackSet: new Set(['nextjs']), depSet: new Set(), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ stack: 'nextjs' }], ctx), {
    matched: true,
    signal: 'stack:nextjs',
  })
})

test('matchRequiresAny: stack clause is case-insensitive (clause lowercased)', () => {
  const ctx = { stackSet: new Set(['nextjs']), depSet: new Set(), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ stack: 'NextJS' }], ctx), {
    matched: true,
    signal: 'stack:NextJS',
  })
})

test('matchRequiresAny: dependency clause matches when depSet contains the dependency', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(['react']), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ dependency: 'react' }], ctx), {
    matched: true,
    signal: 'dependency:react',
  })
})

test('matchRequiresAny: packageNamePattern with wildcard matches prefix in depSet', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(['@sentry/node']), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ packageNamePattern: '@sentry/*' }], ctx), {
    matched: true,
    signal: 'packageNamePattern:@sentry/*',
  })
})

test('matchRequiresAny: packageNamePattern without wildcard does an exact match', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(['react']), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ packageNamePattern: 'react' }], ctx), {
    matched: true,
    signal: 'packageNamePattern:react',
  })
})

test('matchRequiresAny: packageNamePattern wildcard does not match unrelated dep', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(['@babel/core']), roleSet: new Set() }
  assert.deepEqual(matchRequiresAny([{ packageNamePattern: '@sentry/*' }], ctx), {
    matched: false,
  })
})

test('matchRequiresAny: role clause matches when roleSet contains the role', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(), roleSet: new Set(['next-app']) }
  assert.deepEqual(matchRequiresAny([{ role: 'next-app' }], ctx), {
    matched: true,
    signal: 'role:next-app',
  })
})

test('matchRequiresAny: role clause is case-insensitive', () => {
  const ctx = { stackSet: new Set(), depSet: new Set(), roleSet: new Set(['next-app']) }
  assert.deepEqual(matchRequiresAny([{ role: 'Next-App' }], ctx), {
    matched: true,
    signal: 'role:Next-App',
  })
})

test('matchRequiresAny: no matching clause returns not matched', () => {
  const ctx = { stackSet: new Set(['vue']), depSet: new Set(['lodash']), roleSet: new Set(['spa']) }
  assert.deepEqual(
    matchRequiresAny([{ stack: 'nextjs' }, { dependency: 'react' }, { role: 'next-app' }], ctx),
    { matched: false },
  )
})

test('matchRequiresAny: first matching clause wins when multiple clauses provided', () => {
  const ctx = {
    stackSet: new Set(['nextjs']),
    depSet: new Set(['react']),
    roleSet: new Set(),
  }
  // first clause (stack:vue) does not match; second (dependency:react) does
  const result = matchRequiresAny([{ stack: 'vue' }, { dependency: 'react' }], ctx)
  assert.deepEqual(result, { matched: true, signal: 'dependency:react' })
})

// describeRequiresAny

test('describeRequiresAny: stack clause', () => {
  assert.equal(describeRequiresAny([{ stack: 'nextjs' }]), 'stack=nextjs')
})

test('describeRequiresAny: dependency clause', () => {
  assert.equal(describeRequiresAny([{ dependency: 'react' }]), 'dependency=react')
})

test('describeRequiresAny: packageNamePattern clause', () => {
  assert.equal(
    describeRequiresAny([{ packageNamePattern: '@sentry/*' }]),
    'packageNamePattern=@sentry/*',
  )
})

test('describeRequiresAny: role clause', () => {
  assert.equal(describeRequiresAny([{ role: 'next-app' }]), 'role=next-app')
})

test('describeRequiresAny: multiple clauses joined with pipe separator', () => {
  assert.equal(
    describeRequiresAny([{ stack: 'nextjs' }, { dependency: 'react' }, { role: 'next-app' }]),
    'stack=nextjs | dependency=react | role=next-app',
  )
})

// mergeRecommendationWarnings

test('mergeRecommendationWarnings: supported status, no risks, no warnings returns empty array', () => {
  const ctx = {
    detectionStatus: 'supported',
    unsupportedSignals: [],
    securityRisks: [],
    warnings: [],
  }
  assert.deepEqual(mergeRecommendationWarnings(ctx), [])
})

test('mergeRecommendationWarnings: unknown status with no unsupportedSignals emits generic no-framework message', () => {
  const ctx = {
    detectionStatus: 'unknown',
    unsupportedSignals: [],
    securityRisks: [],
    warnings: [],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.ok(result.some((l) => /no supported framework/i.test(l)))
})

test('mergeRecommendationWarnings: unknown status with unsupportedSignals mentions detected signal', () => {
  const ctx = {
    detectionStatus: 'unknown',
    unsupportedSignals: ['python'],
    securityRisks: [],
    warnings: [],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.ok(result.some((l) => /detected python/i.test(l)))
})

test('mergeRecommendationWarnings: partial status with unsupportedSignals emits partially-supported message', () => {
  const ctx = {
    detectionStatus: 'partial',
    unsupportedSignals: ['python'],
    securityRisks: [],
    warnings: [],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.ok(result.some((l) => /partially supported/i.test(l)))
})

test('mergeRecommendationWarnings: securityRisks are surfaced', () => {
  const ctx = {
    detectionStatus: 'supported',
    unsupportedSignals: [],
    securityRisks: ['hardcoded-token'],
    warnings: [],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.ok(result.some((l) => /hardcoded-token/.test(l)))
})

test('mergeRecommendationWarnings: context.warnings are included in output', () => {
  const ctx = {
    detectionStatus: 'supported',
    unsupportedSignals: [],
    securityRisks: [],
    warnings: ['package.json missing'],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.ok(result.includes('package.json missing'))
})

test('mergeRecommendationWarnings: duplicate entries are deduplicated', () => {
  const duplicateWarning =
    'Stack not recognised — no supported framework detected. Only stack-agnostic workflow and security guidance is applied.'
  const ctx = {
    detectionStatus: 'unknown',
    unsupportedSignals: [],
    securityRisks: [],
    // same message that would be produced by the 'unknown' status branch
    warnings: [duplicateWarning],
  }
  const result = mergeRecommendationWarnings(ctx)
  assert.equal(
    result.filter((l) => l === duplicateWarning).length,
    1,
    'duplicate warning should appear only once',
  )
})
