import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANION_TOOLS,
  buildCompanionSuggestions,
  printCompanionToolSuggestions,
} from '../src/install/companion-tools.js'

test('suggests every tool when none are installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, () => false)
  const text = lines.join('\n')
  assert.match(text, /Caveman/)
  assert.match(text, /RTK/)
  // exact install command for caveman is present
  assert.match(text, /install\.sh \| bash/)
  // rtk primary + fallback both present
  assert.match(text, /brew install rtk/)
  assert.match(text, /cargo install --git/)
})

test('skips a tool that is already installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, (bin) => bin === 'rtk')
  const text = lines.join('\n')
  assert.match(text, /Caveman/)
  assert.doesNotMatch(text, /RTK/)
})

test('returns empty array when all tools are installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, () => true)
  assert.deepEqual(lines, [])
})

test('config covers exactly caveman and rtk', () => {
  assert.deepEqual(COMPANION_TOOLS.map((t) => t.bin).sort(), ['caveman', 'rtk'])
})

test('printCompanionToolSuggestions prints missing-tool blocks via injected deps', () => {
  const out = []
  printCompanionToolSuggestions({
    isInstalled: () => false,
    log: (msg) => out.push(String(msg ?? '')),
  })
  const text = out.join('\n')
  assert.match(text, /Caveman/)
  assert.match(text, /RTK/)
})

test('printCompanionToolSuggestions prints nothing when all installed', () => {
  const out = []
  printCompanionToolSuggestions({
    isInstalled: () => true,
    log: (msg) => out.push(String(msg ?? '')),
  })
  assert.equal(out.length, 0)
})
