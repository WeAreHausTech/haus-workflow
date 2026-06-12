#!/usr/bin/env node
// Batch-run QA across all synthetic fixtures.
// Emits a structured table per fixture and writes raw outputs under tmp/qa-out/.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const cli = path.join(root, 'dist/cli.js')
const out = path.join(root, 'tmp/qa-out')
fs.mkdirSync(out, { recursive: true })

const targets = [
  { fixture: 'vendure-monorepo' },
  { fixture: 'nextjs-app' },
  { fixture: 'nest-graphql-api' },
  { fixture: 'laravel-app' },
  { fixture: 'wordpress-bedrock-site' },
  { fixture: 'turbo-monorepo' },
  { fixture: 'nx-workspace' },
  { fixture: 'laravel-with-react-frontend' },
  { fixture: 'vendure-with-nextjs-storefront' },
  { fixture: 'orphan-graphql-config' },
  { fixture: 'wordpress-with-node-tooling' },
]

const results = []
for (const t of targets) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-qa-${t.fixture}-`))
  fs.cpSync(path.join(root, 'tests/fixtures/repos', t.fixture), tmp, { recursive: true })
  execaSync('node', [cli, 'scan', '--json'], { cwd: tmp, stdout: 'ignore' })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: tmp, stdout: 'ignore' })
  const scan = JSON.parse(
    fs.readFileSync(path.join(tmp, '.haus-workflow/context-map.json'), 'utf8'),
  )
  const rec = JSON.parse(
    fs.readFileSync(path.join(tmp, '.haus-workflow/recommendation.json'), 'utf8'),
  )
  const entry = {
    fixture: t.fixture,
    roles: scan.repoRoles,
    stacks: scan.detectedStacks,
    selected: rec.recommended.map((x) => ({
      id: x.id,
      mode: x.selectionMode,
      reasons: x.reasons.map((y) => y.code),
    })),
    skipped: rec.skipped.map((x) => x.id),
  }
  fs.writeFileSync(path.join(out, `${t.fixture}.json`), JSON.stringify(entry, null, 2))
  results.push(entry)
  fs.rmSync(tmp, { recursive: true, force: true })
}

fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(results, null, 2))
console.log(`Wrote ${results.length} fixture results to ${out}`)
