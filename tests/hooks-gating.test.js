import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { cloneFixtureToTemp, runHaus } from './helpers/fixture-runner.js'

// P2 hook gating: `haus context --from-hook` must short-circuit (no stdout, no work)
// unless the project explicitly opts in via `.haus-workflow/config.json` ->
// `hooks.context.enabled = true`. The two guards
// (file-access, bash) are NOT gated and must always run.

function readConfig(repo) {
  const file = path.join(repo, '.haus-workflow', 'config.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeConfig(repo, patch) {
  const file = path.join(repo, '.haus-workflow', 'config.json')
  const current = JSON.parse(fs.readFileSync(file, 'utf8'))
  const next = {
    ...current,
    hooks: { ...current.hooks, ...patch },
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2))
}

test('apply --write emits .haus-workflow/config.json with the gated hook default off', () => {
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  const cfg = readConfig(repo)
  assert.equal(cfg.hooks.context.enabled, false)
})

test('context --from-hook is silent when disabled (default)', () => {
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  const out = runHaus(repo, 'context --from-hook')
  assert.equal(out.trim(), '')
})

test('context --from-hook produces output when enabled', () => {
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  writeConfig(repo, { context: { enabled: true } })
  const out = runHaus(repo, 'context --from-hook')
  assert.match(out, /Haus Context/)
})

test('non-hook context invocation is unaffected by the gate', () => {
  // The gate only applies when --from-hook is set. Direct CLI use must
  // continue to work regardless of config.
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  const out = runHaus(repo, 'context')
  assert.match(out, /Haus Context/)
})

test('isHookEnabled treats "true", 1, {} as disabled (strict boolean only)', () => {
  // Defends against fuzzy opt-ins from malformed configs.
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  const file = path.join(repo, '.haus-workflow', 'config.json')
  for (const bogus of ['"true"', '1', '{}', 'null']) {
    fs.writeFileSync(file, `{"hooks":{"context":{"enabled":${bogus}}}}`)
    const out = runHaus(repo, 'context --from-hook')
    assert.equal(out.trim(), '', `expected silent for enabled=${bogus}`)
  }
})

test('doctor reports per-hook gate state', () => {
  const repo = cloneFixtureToTemp('nextjs-app')
  runHaus(repo, 'init')
  runHaus(repo, 'apply --write')
  const out = runHaus(repo, 'doctor')
  assert.match(out, /HOOK context: disabled \(default\)/)

  writeConfig(repo, { context: { enabled: true } })
  const out2 = runHaus(repo, 'doctor')
  assert.match(out2, /HOOK context: enabled/)
})
