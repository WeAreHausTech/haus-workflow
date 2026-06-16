import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isHausProject } from '../src/claude/refresh-project.js'

test('isHausProject detects recommendation.json', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-refresh-project-'))
  mkdirSync(path.join(root, '.haus-workflow'), { recursive: true })
  writeFileSync(
    path.join(root, '.haus-workflow', 'recommendation.json'),
    '{"recommended":[]}',
    'utf8',
  )
  assert.equal(await isHausProject(root), true)
})

test('isHausProject detects tracked project settings without recommendation', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-refresh-project-'))
  mkdirSync(path.join(root, '.claude'), { recursive: true })
  writeFileSync(
    path.join(root, '.claude', 'settings.json'),
    JSON.stringify({ _haus: { hooks: ['haus.guard-bash'] } }),
    'utf8',
  )
  assert.equal(await isHausProject(root), true)
})

test('isHausProject returns false for fresh projects', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-refresh-project-'))
  assert.equal(await isHausProject(root), false)
})
