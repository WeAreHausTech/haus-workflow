// tests/task-classification.test.js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyTaskIntents,
  computeRuleIntents,
} from '../src/recommender/task-classification.js'

test('classifyTaskIntents matches multiple intents word-aware', () => {
  const intents = classifyTaskIntents('add an auth login endpoint with tests')
  assert.ok(intents.has('auth'))
  assert.ok(intents.has('backend')) // "endpoint"
  assert.ok(intents.has('testing')) // "tests"
})

test('classifyTaskIntents normalizes punctuation (docs: , unit-test)', () => {
  const intents = classifyTaskIntents('docs: write a unit-test guide')
  assert.ok(intents.has('docs'))
  assert.ok(intents.has('testing'))
})

test('classifyTaskIntents returns empty set for an unmatched task', () => {
  assert.equal(classifyTaskIntents('refactor the gizmo widget thing').size, 0)
})

test('computeRuleIntents returns empty when no metadata', () => {
  assert.equal(computeRuleIntents({ id: 'x' }).size, 0)
})

test('computeRuleIntents isolates testing rules to the testing intent only', () => {
  const intents = computeRuleIntents({ id: 'x', tags: ['playwright', 'frontend'], ecosystem: 'react' })
  assert.deepEqual([...intents], ['testing'])
})

test('computeRuleIntents maps ecosystems to intents', () => {
  assert.deepEqual([...computeRuleIntents({ id: 'x', ecosystem: 'laravel' })], ['backend'])
  const vendure = computeRuleIntents({ id: 'x', ecosystem: 'vendure' })
  assert.ok(vendure.has('backend') && vendure.has('admin-ui'))
  const next = computeRuleIntents({ id: 'x', ecosystem: 'nextjs' })
  assert.ok(next.has('frontend') && next.has('admin-ui') && next.has('storefront'))
})

test('computeRuleIntents reads direct semantic tags', () => {
  const intents = computeRuleIntents({ id: 'x', tags: ['graphql', 'oidc', 'mariadb', 'nx21'] })
  assert.ok(intents.has('graphql'))
  assert.ok(intents.has('auth'))
  assert.ok(intents.has('database'))
  assert.ok(intents.has('monorepo'))
})
