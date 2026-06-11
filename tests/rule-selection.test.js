// tests/rule-selection.test.js
import test from 'node:test'
import assert from 'node:assert/strict'

import { pickTaskRelevantRules } from '../src/recommender/rule-selection.js'

function rule(id, opts = {}) {
  return {
    id,
    type: 'skill',
    reason: '',
    reasons: opts.reasons ?? [{ code: 'stack-match', message: 'stack match' }],
    selectionMode: opts.baseline ? 'baseline' : 'matched',
    install: true,
    tags: opts.tags ?? [],
    ecosystem: opts.ecosystem,
    tokenEstimate: opts.tokens ?? 100,
  }
}

function rec(recommended) {
  return { recommended, skipped: [] }
}

test('no task returns the entire recommended set', () => {
  const r = rec([rule('a'), rule('b', { baseline: true })])
  assert.deepEqual(
    pickTaskRelevantRules(r, undefined).map((x) => x.id),
    ['a', 'b'],
  )
})

test('intent match narrows to overlapping rules and drops baselines', () => {
  const r = rec([
    rule('base', { baseline: true }),
    rule('laravel', { ecosystem: 'laravel' }), // -> backend intent
    rule('react', { ecosystem: 'react' }), // -> frontend/admin/storefront
  ])
  const out = pickTaskRelevantRules(r, 'add an api endpoint', new Set(['backend']))
  assert.deepEqual(
    out.map((x) => x.id),
    ['laravel'],
  )
})

test('falls back to token-keyword matching when no intents classified', () => {
  const r = rec([
    rule('base', { baseline: true }),
    rule('haus.nextjs-patterns', { tags: ['nextjs'] }),
    rule('haus.laravel-patterns', { tags: ['laravel'] }),
  ])
  const out = pickTaskRelevantRules(r, 'build a nextjs page', new Set())
  assert.deepEqual(
    out.map((x) => x.id),
    ['haus.nextjs-patterns'],
  )
})

test('ambiguous fallback drops role-only rules and caps the set', () => {
  const r = rec([
    rule('base', { baseline: true }),
    rule('role-only', { reasons: [{ code: 'repo-role-match', message: 'role' }] }),
    rule('real', { reasons: [{ code: 'stack-match', message: 'stack' }] }),
  ])
  // Task text matches nothing, no intents -> capped fallback.
  const out = pickTaskRelevantRules(r, 'zzzqqq unmatched', new Set())
  assert.deepEqual(
    out.map((x) => x.id),
    ['real'],
  )
})
