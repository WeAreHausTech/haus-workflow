// tests/worktree-install-plan.test.js
//
// Pure lockfile -> install-command dispatch logic. No filesystem/process access —
// covers every branch of the plan doc's hydration table (docs/plans/
// workspace-worktree-materialization.md, Task 4) without actually running an
// installer, so pnpm/composer/dotnet flows get full logic coverage here even
// though this sandbox may lack those toolchains for a real integration run.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { detectInstallPlan } from '../src/workspace/worktree/install.ts'

const NO_SIGNALS = {
  hasYarnLock: false,
  hasPackageManagerField: false,
  hasPnpmLock: false,
  hasPackageLock: false,
  hasComposerLock: false,
  hasDotnetProject: false,
}

describe('detectInstallPlan', () => {
  test('yarn.lock + packageManager field -> corepack yarn install', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasYarnLock: true, hasPackageManagerField: true })
    assert.deepEqual(plan, { manager: 'yarn', command: 'corepack', args: ['yarn', 'install'] })
  })

  test('yarn.lock without packageManager field -> plain yarn install', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasYarnLock: true })
    assert.deepEqual(plan, { manager: 'yarn', command: 'yarn', args: ['install'] })
  })

  test('pnpm-lock.yaml -> pnpm install --frozen-lockfile', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasPnpmLock: true })
    assert.deepEqual(plan, { manager: 'pnpm', command: 'pnpm', args: ['install', '--frozen-lockfile'] })
  })

  test('package-lock.json -> npm install, NEVER npm ci (would delete node_modules and defeat CoW)', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasPackageLock: true })
    assert.deepEqual(plan, { manager: 'npm', command: 'npm', args: ['install'] })
    assert.ok(!plan.args.includes('ci'))
  })

  test('composer.lock -> composer install', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasComposerLock: true })
    assert.deepEqual(plan, { manager: 'composer', command: 'composer', args: ['install'] })
  })

  test('.csproj/.sln present -> dotnet restore', () => {
    const plan = detectInstallPlan({ ...NO_SIGNALS, hasDotnetProject: true })
    assert.deepEqual(plan, { manager: 'dotnet', command: 'dotnet', args: ['restore'] })
  })

  test('no recognized lockfile -> none', () => {
    const plan = detectInstallPlan(NO_SIGNALS)
    assert.deepEqual(plan, { manager: 'none' })
  })

  test('priority: yarn.lock wins over pnpm/npm/composer/dotnet all present at once', () => {
    const plan = detectInstallPlan({
      hasYarnLock: true,
      hasPackageManagerField: false,
      hasPnpmLock: true,
      hasPackageLock: true,
      hasComposerLock: true,
      hasDotnetProject: true,
    })
    assert.equal(plan.manager, 'yarn')
  })

  test('priority: pnpm wins over npm/composer/dotnet when yarn.lock absent', () => {
    const plan = detectInstallPlan({
      ...NO_SIGNALS,
      hasPnpmLock: true,
      hasPackageLock: true,
      hasComposerLock: true,
      hasDotnetProject: true,
    })
    assert.equal(plan.manager, 'pnpm')
  })
})
