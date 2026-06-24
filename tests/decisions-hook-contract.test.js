import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { runHausRaw } from './helpers/fixture-runner.js'

// Stop hook contract: must always exit 0 so Claude Code parses stdout.

function suggestFromHook(cwd, input = '') {
  return runHausRaw(cwd, ['decisions', 'suggest', '--from-hook'], { input })
}

describe('decisions Stop hook contract', () => {
  it('exits 0 with empty stdin when no trigger', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-decisions-hook-quiet-'))
    fs.writeFileSync(path.join(tmp, 'README.md'), '# hi\n')
    const { stdout, exitCode } = suggestFromHook(tmp)
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), '')
  })

  it('exits 0 and emits JSON when package.json is present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-decisions-hook-'))
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"t"}\n')
    const { stdout, exitCode } = suggestFromHook(tmp)
    assert.equal(exitCode, 0)
    if (stdout.trim()) {
      const payload = JSON.parse(stdout.trim())
      assert.equal(payload.action, 'propose_decision')
      assert.ok(typeof payload.draft === 'string')
    }
  })
})
