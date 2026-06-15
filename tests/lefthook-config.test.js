import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import YAML from 'yaml'

// WS10: the CLI dogfoods the Lefthook standard it ships. Husky must be fully gone.

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))

describe('lefthook migration: package.json', () => {
  it('no longer depends on husky or lint-staged', () => {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    assert.equal(deps.husky, undefined, 'husky devDep should be removed')
    assert.equal(deps['lint-staged'], undefined, 'lint-staged devDep should be removed')
    assert.equal(pkg['lint-staged'], undefined, 'lint-staged config block should be removed')
  })

  it('depends on lefthook and installs it via prepare', () => {
    assert.ok(pkg.devDependencies.lefthook, 'lefthook devDep should be present')
    assert.match(pkg.scripts.prepare, /lefthook install/)
    assert.match(
      pkg.scripts.prepare,
      /\|\| true$/,
      'prepare must stay non-fatal for git-install consumers',
    )
  })
})

describe('lefthook migration: lefthook.yml', () => {
  const config = YAML.parse(fs.readFileSync(path.resolve('lefthook.yml'), 'utf8'))

  it('gates lint, format, typecheck, and secret scanning on pre-commit', () => {
    const cmds = config['pre-commit'].commands
    for (const key of ['lint', 'format', 'typecheck', 'gitleaks', 'secret-grep']) {
      assert.ok(cmds[key], `pre-commit should define ${key}`)
    }
  })

  it('builds dist then runs the fast test subset on pre-push', () => {
    const run = config['pre-push'].commands.test.run
    assert.match(run, /yarn build/)
    assert.match(run, /yarn test:fast/)
  })

  it('gives every command an agent-readable fail_text', () => {
    const all = [
      ...Object.values(config['pre-commit'].commands),
      ...Object.values(config['pre-push'].commands),
    ]
    for (const cmd of all) assert.ok(cmd.fail_text, 'each command needs a fail_text')
  })

  it('no .husky directory remains', () => {
    assert.equal(fs.existsSync(path.resolve('.husky')), false)
  })
})
