import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildRecommendationExplanation,
  normalizeRecommendation,
} from '../src/recommender/explain-recommendation.js'

test('normalizeRecommendation drops legacy score/confidence fields without throwing', () => {
  const legacy = {
    recommended: [
      { id: 'skill.foo', score: 0.87, confidence: 'high', reason: 'matched signal' },
    ],
    skipped: [],
  }
  const normalized = normalizeRecommendation(legacy)
  assert.equal(normalized.recommended.length, 1)
  const item = normalized.recommended[0]
  assert.equal(item.id, 'skill.foo')
  assert.equal('score' in item, false)
  assert.equal('confidence' in item, false)
  assert.equal(item.type, 'skill')
  assert.equal(item.selectionMode, 'matched')
  assert.equal(item.install, true)
})

test('normalizeRecommendation synthesizes reasons from a bare legacy reason string', () => {
  const legacy = { recommended: [{ id: 'skill.foo', reason: 'legacy free-text reason' }] }
  const normalized = normalizeRecommendation(legacy)
  assert.deepEqual(normalized.recommended[0].reasons, [
    { code: 'legacy-reason', message: 'legacy free-text reason' },
  ])
})

test('normalizeRecommendation preserves current-shape reasons and selectionMode as-is', () => {
  const current = {
    recommended: [
      {
        id: 'skill.bar',
        type: 'agent',
        reason: 'matched: touched files',
        reasons: [{ code: 'file-touch', message: 'touched files', signal: 'src/**' }],
        selectionMode: 'baseline',
        install: false,
        tags: ['workflow'],
        tokenEstimate: 500,
      },
    ],
  }
  const normalized = normalizeRecommendation(current)
  const item = normalized.recommended[0]
  assert.equal(item.type, 'agent')
  assert.equal(item.selectionMode, 'baseline')
  assert.equal(item.install, false)
  assert.deepEqual(item.reasons, [{ code: 'file-touch', message: 'touched files', signal: 'src/**' }])
  assert.deepEqual(item.tags, ['workflow'])
  assert.equal(item.tokenEstimate, 500)
})

test('normalizeRecommendation synthesizes skipReasons from a bare legacy skip reason', () => {
  const legacy = { skipped: [{ id: 'skill.baz', reason: 'no matching signal' }] }
  const normalized = normalizeRecommendation(legacy)
  assert.equal(normalized.skipped.length, 1)
  assert.equal(normalized.skipped[0].reason, 'no matching signal')
  assert.deepEqual(normalized.skipped[0].skipReasons, [
    { code: 'legacy-skip-reason', message: 'no matching signal' },
  ])
})

test('normalizeRecommendation fills in stats when absent', () => {
  const legacy = { recommended: [{ id: 'a' }, { id: 'b' }], skipped: [{ id: 'c' }] }
  const normalized = normalizeRecommendation(legacy)
  assert.equal(normalized.warnings.length, 0)
  assert.equal(normalized.selectedRules, 2)
  assert.equal(normalized.skippedRules, 1)
  assert.equal(normalized.estimatedContextTokens, 2 * 320)
  assert.equal(normalized.estimatedTokenReductionPct, 33)
})

test('normalizeRecommendation preserves explicit stats when present', () => {
  const current = {
    recommended: [{ id: 'a' }],
    skipped: [],
    warnings: ['some warning'],
    estimatedContextTokens: 1234,
    selectedRules: 1,
    skippedRules: 0,
    estimatedTokenReductionPct: 50,
  }
  const normalized = normalizeRecommendation(current)
  assert.deepEqual(normalized.warnings, ['some warning'])
  assert.equal(normalized.estimatedContextTokens, 1234)
  assert.equal(normalized.estimatedTokenReductionPct, 50)
})

test('buildRecommendationExplanation maps a normalized Recommendation into selected/skipped/stats', () => {
  const normalized = normalizeRecommendation({
    recommended: [
      {
        id: 'skill.foo',
        selectionMode: 'matched',
        reasons: [{ code: 'file-touch', message: 'touched files', signal: 'src/**' }],
      },
    ],
    skipped: [{ id: 'skill.bar', skipReasons: [{ code: 'no-signal', message: 'no signal matched' }] }],
  })
  const explanation = buildRecommendationExplanation(normalized)
  assert.deepEqual(explanation.selected, [
    { id: 'skill.foo', selectionMode: 'matched', reasons: ['touched files'] },
  ])
  assert.equal(explanation.skipped.length, 1)
  assert.equal(explanation.skipped[0].id, 'skill.bar')
  assert.deepEqual(explanation.skipped[0].reasons, ['no signal matched'])
  assert.deepEqual(explanation.skipped[0].reasonDetails, [
    { code: 'no-signal', message: 'no signal matched' },
  ])
  assert.equal(explanation.stats.selectedRules, normalized.selectedRules)
  assert.equal(explanation.stats.skippedRules, normalized.skippedRules)
  assert.equal(explanation.stats.estimatedTokenReductionPct, normalized.estimatedTokenReductionPct)
})

test('buildRecommendationExplanation preserves a signal in reasonDetails when present', () => {
  const normalized = normalizeRecommendation({
    recommended: [],
    skipped: [
      {
        id: 'skill.baz',
        skipReasons: [{ code: 'blocked', message: 'blocked by policy', signal: 'risk:high' }],
      },
    ],
  })
  const explanation = buildRecommendationExplanation(normalized)
  assert.deepEqual(explanation.skipped[0].reasonDetails, [
    { code: 'blocked', message: 'blocked by policy', signal: 'risk:high' },
  ])
})
