import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execaSync } from 'execa'

const FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

function cliPath() {
  return path.resolve('dist/cli.js')
}

function hausEnv() {
  return { ...process.env, HAUS_FIXTURE_CATALOG: FIXTURE_CATALOG }
}

export function cloneFixtureToTemp(fixtureName) {
  const fixtureRoot = path.resolve('tests/fixtures/repos', fixtureName)
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-fixture-${fixtureName}-`))
  fs.cpSync(fixtureRoot, temp, { recursive: true })
  return temp
}

export function runHaus(cwd, command) {
  const args = []
  const tokenRegex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = tokenRegex.exec(command)) !== null) {
    args.push(match[1] ?? match[2] ?? match[3])
  }
  const result = execaSync('node', [cliPath(), ...args], { cwd, env: hausEnv() })
  return result.stdout
}

export function readHausJson(cwd, fileName) {
  const file = path.join(cwd, '.haus-workflow', fileName)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
