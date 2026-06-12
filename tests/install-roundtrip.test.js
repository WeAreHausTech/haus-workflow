import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Integration round-trip for `haus install` / `haus uninstall` against a stubbed
// HOME. install.test.js already covers deny/allow/command strip individually; this
// file covers what it does NOT: that hooks merge at the integration level, that a
// user's pre-existing settings survive install AND uninstall, that install is
// idempotent, and that uninstall restores settings.json exactly. Stripping the
// wrong entry corrupts a user's real ~/.claude, so the restore must be exact.

const HAUS_GUARD_FILE = 'haus guard file-access --from-hook'
const HAUS_GUARD_BASH = 'haus guard bash --from-hook'

// A representative user-owned settings.json present before haus ever runs.
function seedUserSettings() {
  return {
    model: 'claude-opus-4',
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-linter' }] }],
    },
    permissions: {
      deny: ['Bash(my-secret-thing:*)'],
      allow: ['Bash(my-own-tool:*)'],
    },
  }
}

function preToolUseCommands(settings) {
  return (settings.hooks?.PreToolUse ?? []).flatMap((entry) =>
    (entry.hooks ?? []).map((h) => h.command),
  )
}

describe('install/uninstall round-trip (stubbed HOME)', () => {
  let tmpDir
  let settingsPath
  let prevHome
  let prevUserProfile

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-roundtrip-'))
    prevHome = process.env.HOME
    prevUserProfile = process.env.USERPROFILE
    process.env.HOME = tmpDir
    process.env.USERPROFILE = tmpDir
    // Pre-seed the user's settings.json so we can prove preservation + restore.
    settingsPath = path.join(tmpDir, '.claude', 'settings.json')
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(seedUserSettings(), null, 2))
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function readSettings() {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  }

  it('merges the two PreToolUse guard hooks', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const settings = readSettings()

    const cmds = preToolUseCommands(settings)
    assert.ok(cmds.includes(HAUS_GUARD_FILE), 'file-access guard hook should be merged')
    assert.ok(cmds.includes(HAUS_GUARD_BASH), 'bash guard hook should be merged')
    assert.equal(settings.hooks?.UserPromptSubmit, undefined, 'no UserPromptSubmit hooks')
    assert.ok((settings._haus?.hooks?.length ?? 0) > 0, 'installed hook ids tracked in _haus')
    assert.ok((settings._haus?.hookCommands?.length ?? 0) > 0, 'hook commands tracked in _haus')
  })

  it('preserves the user’s own hook, deny, allow, and top-level keys after install', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const settings = readSettings()

    assert.equal(settings.model, 'claude-opus-4', 'top-level user key preserved')
    assert.ok(preToolUseCommands(settings).includes('my-own-linter'), 'user hook preserved')
    assert.ok(settings.permissions.deny.includes('Bash(my-secret-thing:*)'), 'user deny preserved')
    assert.ok(settings.permissions.allow.includes('Bash(my-own-tool:*)'), 'user allow preserved')
  })

  it('is idempotent: installing twice adds no duplicate hooks or rules', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const first = readSettings()
    await applyInstall({})
    const second = readSettings()

    // Guard the structure first so a missing hooks block fails as a clear
    // assertion rather than a TypeError on `.length`.
    assert.ok(Array.isArray(first.hooks?.PreToolUse), 'first install wrote PreToolUse hooks')
    assert.ok(Array.isArray(second.hooks?.PreToolUse), 'second install kept PreToolUse hooks')
    assert.equal(
      second.hooks.PreToolUse.length,
      first.hooks.PreToolUse.length,
      'PreToolUse length unchanged on second install',
    )
    assert.deepEqual(second._haus.hooks, first._haus.hooks, 'tracked hook ids not duplicated')
    assert.deepEqual(second.permissions.deny, first.permissions.deny, 'deny rules unchanged')
    assert.deepEqual(second.permissions.allow, first.permissions.allow, 'allow rules unchanged')
    assert.deepEqual(second.permissions.ask, first.permissions.ask, 'ask rules unchanged')
  })

  it('restores settings.json exactly after install → uninstall', async () => {
    const original = seedUserSettings()
    const { applyInstall } = await import('../src/install/apply.js')
    const { runUninstall } = await import('../src/install/uninstall.js')

    await applyInstall({})
    await runUninstall({ force: true })
    const restored = readSettings()

    assert.deepEqual(restored, original, 'settings.json must match the pre-install snapshot')
    assert.equal(restored._haus, undefined, 'no _haus block left behind')
    const cmds = preToolUseCommands(restored)
    assert.ok(
      !cmds.includes(HAUS_GUARD_FILE) && !cmds.includes(HAUS_GUARD_BASH),
      'no haus hooks left',
    )
  })
})
