import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanProject } from '../src/scanner/scan-project.ts'

/**
 * Characterization (golden) test: locks the scanner's detection output across every
 * fixture so the WS3 registry refactor cannot silently change behavior. If detection
 * intentionally changes, regenerate tests/fixtures/detection-golden.json and review
 * the diff.
 */
const golden = JSON.parse(
  fs.readFileSync(new URL('./fixtures/detection-golden.json', import.meta.url), 'utf8'),
)
const REPOS = path.resolve(new URL('./fixtures/repos', import.meta.url).pathname)

for (const fixture of Object.keys(golden)) {
  test(`detection is stable for fixture: ${fixture}`, async () => {
    // scanProject writes artifacts into <root>/.haus-workflow; run against a temp copy
    // so the fixture tree stays pristine and tests stay hermetic.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-scan-${fixture}-`))
    fs.cpSync(path.join(REPOS, fixture), tmp, { recursive: true })
    const result = await scanProject(tmp, 'fast')
    assert.deepEqual(result.repoRoles, golden[fixture].repoRoles, 'repoRoles drift')
    assert.deepEqual(result.detectedStacks, golden[fixture].detectedStacks, 'detectedStacks drift')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
}
