import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Unit tests import TypeScript source directly via tsx (see package.json "test").
import {
  parseMarkdownHeader,
  buildMarkdownHeader,
  stampMarkdown,
  hasHausHeader,
} from '../src/install/header.js'
import { mergeHooks, stripHausHooks } from '../src/install/settings-merge.js'

// ---- header.ts tests --------------------------------------------------------

describe('header: parseMarkdownHeader', () => {
  it('parses a valid HAUS-MANAGED header', () => {
    const content =
      '<!-- HAUS-MANAGED id=skill.haus-workflow v=1 source=haus@0.1.0 -->\nrest of file'
    const h = parseMarkdownHeader(content)
    assert.equal(h?.stableId, 'skill.haus-workflow')
    assert.equal(h?.schemaVersion, '1')
    assert.equal(h?.source, 'haus@0.1.0')
  })

  it('returns undefined for content without header', () => {
    assert.equal(parseMarkdownHeader('no header here'), undefined)
  })

  it('returns undefined for partial header', () => {
    assert.equal(parseMarkdownHeader('<!-- HAUS-MANAGED id=foo -->'), undefined)
  })
})

describe('header: buildMarkdownHeader', () => {
  it('builds a well-formed header line', () => {
    const line = buildMarkdownHeader({
      stableId: 'agent.haus-planner',
      schemaVersion: '1',
      source: 'haus@0.1.0',
    })
    assert.ok(line.startsWith('<!-- HAUS-MANAGED'))
    assert.ok(line.includes('id=agent.haus-planner'))
    assert.ok(line.includes('v=1'))
    assert.ok(line.includes('source=haus@0.1.0'))
    assert.ok(line.endsWith('-->'))
  })
})

describe('header: stampMarkdown', () => {
  it('prepends header to content without one', () => {
    const result = stampMarkdown('body text', {
      stableId: 'x',
      schemaVersion: '1',
      source: 'haus@0.1.0',
    })
    assert.ok(result.startsWith('<!-- HAUS-MANAGED'))
    assert.ok(result.includes('body text'))
  })

  it('replaces existing header, preserving body', () => {
    const original = '<!-- HAUS-MANAGED id=x v=1 source=haus@0.0.1 -->\nbody'
    const result = stampMarkdown(original, {
      stableId: 'x',
      schemaVersion: '1',
      source: 'haus@0.1.0',
    })
    const lines = result.split('\n')
    assert.ok(lines[0].includes('source=haus@0.1.0'))
    assert.equal(lines[1], 'body')
  })
})

describe('header: hasHausHeader', () => {
  it('returns true for managed content', () => {
    assert.ok(hasHausHeader('<!-- HAUS-MANAGED id=x v=1 source=y@0.1.0 -->\nfoo'))
  })

  it('returns false for unmanaged content', () => {
    assert.ok(!hasHausHeader('# just a markdown file'))
  })
})

// ---- settings-merge.ts tests ------------------------------------------------

const KEEP_FRAGMENT = {
  id: 'hook.guard.bash',
  gate: 'keep',
  event: 'PreToolUse',
  matcher: 'Bash',
  command: 'haus guard bash --from-hook',
}

describe('settings-merge: mergeHooks', () => {
  it('adds keep hooks to empty settings', () => {
    const { settings, addedIds } = mergeHooks({}, [KEEP_FRAGMENT])
    assert.deepEqual(addedIds, ['hook.guard.bash'])
    assert.ok(Array.isArray(settings.hooks?.['PreToolUse']))
    assert.equal(settings.hooks?.['PreToolUse']?.length, 1)
    assert.equal(settings._haus?.hooks?.[0], 'hook.guard.bash')
  })

  it('re-adds hooks tracked in _haus when the real hook entry was deleted', () => {
    const existing = { _haus: { hooks: ['hook.guard.bash'] } }
    const { addedIds, settings } = mergeHooks(existing, [KEEP_FRAGMENT])
    assert.deepEqual(addedIds, [])
    assert.equal(settings.hooks?.['PreToolUse']?.length, 1)
  })

  it('does not duplicate a hook already present in hooks[event]', () => {
    const existing = {
      _haus: { hooks: [] },
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'haus guard bash --from-hook' }],
          },
        ],
      },
    }
    const { addedIds } = mergeHooks(existing, [KEEP_FRAGMENT])
    assert.deepEqual(addedIds, [])
    assert.equal(existing.hooks['PreToolUse'].length, 1)
  })

  it('preserves user-added hooks in other events', () => {
    const existing = {
      hooks: {
        PostToolUse: [{ hooks: [{ type: 'command', command: 'my-custom-hook' }] }],
      },
    }
    const { settings } = mergeHooks(existing, [KEEP_FRAGMENT])
    assert.ok(Array.isArray(settings.hooks?.['PostToolUse']))
    assert.equal(settings.hooks?.['PostToolUse']?.length, 1)
  })
})

describe('settings-merge: stripHausHooks', () => {
  it('removes haus hook entries and _haus block', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'haus guard bash --from-hook' }] },
          { matcher: 'Read', hooks: [{ type: 'command', command: 'user-hook' }] },
        ],
      },
      _haus: { hooks: ['hook.guard.bash'] },
    }
    const stripped = stripHausHooks(settings)
    assert.equal(stripped._haus, undefined)
    // user-hook still present
    assert.equal(stripped.hooks?.['PreToolUse']?.length, 1)
    assert.equal(stripped.hooks?.['PreToolUse']?.[0].hooks[0].command, 'user-hook')
  })

  it('no-ops on settings with no _haus block', () => {
    const settings = {
      hooks: { PreToolUse: [] },
    }
    const stripped = stripHausHooks(settings)
    assert.deepEqual(stripped, settings)
  })

  it('strips by exact hookCommands when present, preserving non-haus commands', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'haus guard bash --from-hook' }] },
          { matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-tool check' }] },
        ],
      },
      _haus: {
        hooks: ['hook.guard.bash'],
        hookCommands: ['haus guard bash --from-hook'],
      },
    }
    const stripped = stripHausHooks(settings)
    assert.equal(stripped._haus, undefined)
    assert.equal(stripped.hooks?.['PreToolUse']?.length, 1)
    assert.equal(stripped.hooks?.['PreToolUse']?.[0].hooks[0].command, 'my-own-tool check')
  })

  it('strips only haus commands from mixed multi-command entries', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: 'haus guard bash --from-hook' },
              { type: 'command', command: 'my-own-tool check' },
            ],
          },
        ],
      },
      _haus: {
        hooks: ['hook.guard.bash'],
        hookCommands: ['haus guard bash --from-hook'],
      },
    }
    const stripped = stripHausHooks(settings)
    assert.equal(stripped._haus, undefined)
    assert.equal(stripped.hooks?.['PreToolUse']?.length, 1)
    assert.deepEqual(stripped.hooks?.['PreToolUse']?.[0].hooks, [
      { type: 'command', command: 'my-own-tool check' },
    ])
  })

  it('removes _haus key even when hooks array is empty', () => {
    const settings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'some-user-hook' }] }],
      },
      _haus: { hooks: [], hookCommands: [] },
    }
    const stripped = stripHausHooks(settings)
    assert.equal(stripped._haus, undefined)
    // user hook preserved
    assert.equal(stripped.hooks?.['PreToolUse']?.length, 1)
  })
})

// ---- integration: haus install / uninstall via CLI --------------------------

describe('applyInstall dry-run (real invocation, stubbed HOME)', () => {
  let tmpDir
  let prevHome
  let prevUserProfile

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-install-test-'))
    // Stub the home dir so globalClaudeDir() (os.homedir()) can never touch a real ~/.claude.
    prevHome = process.env.HOME
    prevUserProfile = process.env.USERPROFILE
    process.env.HOME = tmpDir
    process.env.USERPROFILE = tmpDir
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('stages bundled skills for creation but writes nothing to ~/.claude', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    const result = await applyInstall({ dryRun: true })

    // Bundled global skills are reported as "would create".
    assert.ok(result.created.length > 0, 'expected bundled skills to be staged for creation')
    assert.equal(result.drift, false)
    // Dry-run must not write anything — not even the .claude directory.
    assert.equal(fs.existsSync(path.join(tmpDir, '.claude')), false)
  })

  it('writes permissions.deny with the NEVER rules on a real install', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    )
    assert.ok(Array.isArray(settings.permissions?.deny), 'permissions.deny should be written')
    assert.ok(settings.permissions.deny.includes('Bash(sudo:*)'))
    assert.ok(settings.permissions.deny.includes('Bash(git push --force:*)'))
    assert.ok(
      settings.permissions.deny.some((r) => r.startsWith('Read(') && r.includes('.pem')),
      'expected a Read deny for *.pem',
    )
    assert.ok((settings._haus?.denyRules?.length ?? 0) > 0, 'deny rules should be tracked in _haus')
  })

  it('strips haus deny rules on uninstall, leaving none behind', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    const { runUninstall } = await import('../src/install/uninstall.js')
    await applyInstall({})
    await runUninstall({ force: true })
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    )
    const deny = settings.permissions?.deny ?? []
    assert.ok(!deny.includes('Bash(rm -rf:*)'), 'haus deny rules should be stripped on uninstall')
    assert.equal(settings._haus?.denyRules, undefined)
  })

  it('no longer seeds standalone haus-* commands — everything routes through the haus-workflow skill', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const commandsDir = path.join(tmpDir, '.claude', 'commands')
    assert.equal(
      fs.existsSync(commandsDir),
      false,
      'library/global/commands/ is empty — no commands should be seeded',
    )
  })

  it('seeds global skills flat into ~/.claude/skills and tracks them (WS6)', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const skillsDir = path.join(tmpDir, '.claude', 'skills')
    const skillNames = fs.readdirSync(skillsDir)
    assert.ok(skillNames.length >= 1, 'expected all bundled skills to be seeded')
    for (const name of skillNames) {
      const file = path.join(skillsDir, name, 'SKILL.md')
      // Skills carry frontmatter so Claude Code shows a clean `description:` on hover;
      // the haus stamp lives in a `haus_managed:` field inside the block (ADR-0006).
      const body = fs.readFileSync(file, 'utf8')
      assert.ok(body.startsWith('---\n'), `${name}/SKILL.md should open with frontmatter`)
      assert.match(body, /^description: .+/m, `${name}/SKILL.md should expose a description`)
      assert.match(
        body,
        /^haus_managed: "id=skill\./m,
        `${name}/SKILL.md should carry the haus marker`,
      )
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'haus', 'install-manifest.json'), 'utf8'),
    )
    const ids = manifest.files.map((f) => f.stableId)
    for (const name of skillNames) {
      assert.ok(ids.includes(`skill.${name}`), `manifest should track skill.${name}`)
    }
  })

  it('installs a skill\'s references/ folder alongside SKILL.md, not just the entry file', async () => {
    // applyInstall stamps/copies files individually rather than fs.copy-ing whole skill
    // directories — the haus-workflow skill's SKILL.md points at `references/init.md`
    // etc, so those files must be seeded too or the skill breaks at runtime.
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const referencesDir = path.join(tmpDir, '.claude', 'skills', 'haus-workflow', 'references')
    assert.ok(fs.existsSync(referencesDir), 'references/ folder should be seeded')
    const refFiles = fs.readdirSync(referencesDir)
    assert.ok(refFiles.includes('init.md'), 'references/init.md should be seeded')
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'haus', 'install-manifest.json'), 'utf8'),
    )
    const ids = manifest.files.map((f) => f.stableId)
    assert.ok(
      ids.includes('skill.haus-workflow.references.init.md'),
      'manifest should track the reference file',
    )
  })

  it('writes scoped permissions.allow for haus subcommands, never a blanket allow (WS6)', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    )
    const allow = settings.permissions?.allow ?? []
    assert.ok(allow.includes('Bash(haus setup-project:*)'))
    assert.ok(allow.includes('Bash(haus doctor:*)'))
    assert.ok(!allow.includes('Bash(haus:*)'), 'must not pre-allow a blanket Bash(haus:*)')
    assert.ok((settings._haus?.allowRules?.length ?? 0) > 0, 'allow rules tracked in _haus')
  })

  it('strips haus allow rules and removes seeded skills (incl. references/) on uninstall (WS6)', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    const { runUninstall } = await import('../src/install/uninstall.js')
    await applyInstall({})
    await runUninstall({ force: true })
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    )
    const allow = settings.permissions?.allow ?? []
    assert.ok(!allow.includes('Bash(haus doctor:*)'), 'haus allow rules stripped on uninstall')
    assert.equal(settings._haus?.allowRules, undefined)
    assert.equal(
      fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'haus-workflow', 'SKILL.md')),
      false,
      'seeded skill should be removed on uninstall',
    )
    assert.equal(
      fs.existsSync(
        path.join(tmpDir, '.claude', 'skills', 'haus-workflow', 'references', 'init.md'),
      ),
      false,
      'seeded skill reference files should be removed on uninstall too',
    )
  })
})
