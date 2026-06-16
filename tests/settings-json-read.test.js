import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readProjectSettings } from '../src/claude/merge-project-settings.js'
import { readSettings } from '../src/install/settings-merge.js'
import { MalformedJsonFileError } from '../src/utils/fs.js'

test('readSettings refuses to merge malformed global settings and writes backup', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'haus-settings-read-'))
  const prevHome = process.env.HOME
  process.env.HOME = home
  try {
    const claudeDir = path.join(home, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = path.join(claudeDir, 'settings.json')
    writeFileSync(settingsPath, '{not-json', 'utf8')

    await assert.rejects(readSettings(), (err) => {
      assert.ok(err instanceof MalformedJsonFileError)
      assert.equal(err.filePath, settingsPath)
      assert.match(err.backupPath, /\.haus-malformed-.*\.bak$/)
      return true
    })

    const siblings = readdirSync(claudeDir)
    assert.ok(siblings.some((name) => name.includes('.haus-malformed-') && name.endsWith('.bak')))
  } finally {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
  }
})

test('readProjectSettings refuses malformed project settings and writes backup', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'haus-project-settings-'))
  const settingsDir = path.join(root, '.claude')
  mkdirSync(settingsDir, { recursive: true })
  const settingsPath = path.join(settingsDir, 'settings.json')
  writeFileSync(settingsPath, '{broken', 'utf8')

  await assert.rejects(readProjectSettings(root), (err) => {
    assert.ok(err instanceof MalformedJsonFileError)
    assert.equal(err.filePath, settingsPath)
    assert.match(err.backupPath, /\.haus-malformed-.*\.bak$/)
    return true
  })

  const siblings = readdirSync(settingsDir)
  assert.ok(siblings.some((name) => name.includes('.haus-malformed-') && name.endsWith('.bak')))
})
