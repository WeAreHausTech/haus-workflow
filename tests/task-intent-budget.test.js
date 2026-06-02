import test from 'node:test'
import assert from 'node:assert/strict'

import {
  pickTaskRelevantRules,
  DEFAULT_CONTEXT_TOKEN_BUDGET,
} from '../src/recommender/task-intent.ts'
import { normalizeRecommendation } from '../src/recommender/explain-recommendation.ts'

const rule = (id, score, tokenEstimate, selectionMode = 'matched') => ({
  id,
  type: 'skill',
  reason: '',
  reasons: [],
  confidence: 0.8,
  confidenceLevel: 'high',
  selectionMode,
  install: true,
  score,
  scoreBreakdown: { bonuses: [], penalties: [], finalScore: score },
  tags: [],
  tokenEstimate,
})

const rec = (recommended) => ({
  mode: 'fast',
  recommended,
  skipped: [],
  warnings: [],
  estimatedContextTokens: 0,
  selectedRules: recommended.length,
  skippedRules: 0,
  estimatedTokenReductionPct: 0,
})

test('no budget → returns all rules unchanged', () => {
  const r = rec([rule('a', 10, 5000), rule('b', 5, 5000), rule('c', 1, 5000)])
  const out = pickTaskRelevantRules(r, undefined, new Set())
  assert.deepEqual(out.map((x) => x.id), ['a', 'b', 'c'])
})

test('budget drops lowest-scoring rules until cumulative estimate fits', () => {
  const r = rec([rule('a', 10, 5000), rule('b', 5, 5000), rule('c', 1, 5000)])
  // Budget 11000 fits two 5000-token rules; lowest score (c) dropped.
  const out = pickTaskRelevantRules(r, undefined, new Set(), { tokenBudget: 11000 })
  assert.deepEqual(out.map((x) => x.id), ['a', 'b'])
})

test('budget never drops baseline rules even if over budget', () => {
  const r = rec([
    rule('base', 0, 9000, 'baseline'),
    rule('a', 10, 5000),
    rule('b', 5, 5000),
  ])
  // Baseline alone (9000) already near budget; matched rules trimmed but base kept.
  const out = pickTaskRelevantRules(r, undefined, new Set(), { tokenBudget: 10000 })
  assert.ok(out.some((x) => x.id === 'base'), 'baseline preserved')
  assert.equal(out.filter((x) => x.selectionMode === 'matched').length, 0)
})

test('output preserves original order of kept rules', () => {
  const r = rec([rule('a', 1, 4000), rule('b', 9, 4000), rule('c', 5, 4000)])
  // Budget 8000 keeps the two highest scores (b, c) — but in original order a-first? a dropped.
  const out = pickTaskRelevantRules(r, undefined, new Set(), { tokenBudget: 8000 })
  assert.deepEqual(out.map((x) => x.id), ['b', 'c'])
})

test('DEFAULT_CONTEXT_TOKEN_BUDGET is a positive number', () => {
  assert.equal(typeof DEFAULT_CONTEXT_TOKEN_BUDGET, 'number')
  assert.ok(DEFAULT_CONTEXT_TOKEN_BUDGET > 0)
})

test('normalizeRecommendation preserves tokenEstimate so the budget can trim', () => {
  // Regression: `haus context` feeds normalizeRecommendation() output into
  // pickTaskRelevantRules. If normalize drops tokenEstimate, applyTokenBudget
  // sees 0 for every rule and the budget silently never trims.
  const normalized = normalizeRecommendation({
    mode: 'fast',
    recommended: [
      { id: 'a', score: 10, tokenEstimate: 5000, selectionMode: 'matched' },
      { id: 'b', score: 5, tokenEstimate: 5000, selectionMode: 'matched' },
      { id: 'c', score: 1, tokenEstimate: 5000, selectionMode: 'matched' },
    ],
    skipped: [],
  })
  assert.deepEqual(
    normalized.recommended.map((x) => x.tokenEstimate),
    [5000, 5000, 5000],
  )
  const out = pickTaskRelevantRules(normalized, undefined, new Set(), { tokenBudget: 11000 })
  assert.deepEqual(out.map((x) => x.id), ['a', 'b'])
})
