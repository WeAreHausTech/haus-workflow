import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Regression guard for ADR-0006 / the "/haus-workflow shows no menu in Desktop" bug.
// The global install path (applyInstall) stamps an ownership marker onto every managed
// file. For a SKILL.md it must NOT push an HTML comment onto line 1 — that breaks the
// YAML frontmatter Claude Code needs to register the skill. After install every skill
// must keep `---` on line 1 and expose a real name/description, and the ownership marker
// (now a frontmatter field) must still drive re-install ownership/drift detection.

function listSkillFiles(claudeDir) {
  const skillsDir = path.join(claudeDir, 'skills')
  if (!fs.existsSync(skillsDir)) return []
  const out = []
  for (const name of fs.readdirSync(skillsDir)) {
    const f = path.join(skillsDir, name, 'SKILL.md')
    if (fs.existsSync(f)) out.push(f)
  }
  return out
}

describe('global install — skill frontmatter integrity (ADR-0006)', () => {
  let tmpDir
  let claudeDir
  let prevHome
  let prevUserProfile

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-skill-fm-'))
    prevHome = process.env.HOME
    prevUserProfile = process.env.USERPROFILE
    process.env.HOME = tmpDir
    process.env.USERPROFILE = tmpDir
    claudeDir = path.join(tmpDir, '.claude')
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('installs every skill with valid line-1 frontmatter and a real description', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    await applyInstall({})

    const skills = listSkillFiles(claudeDir)
    assert.ok(skills.length > 0, 'expected at least one installed skill')

    for (const file of skills) {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      assert.equal(lines[0], '---', `${file}: line 1 must be the frontmatter fence`)
      assert.ok(!lines[0].includes('HAUS-MANAGED'), `${file}: no marker on line 1`)

      // Frontmatter block = up to the second fence.
      const close = lines.indexOf('---', 1)
      assert.ok(close > 0, `${file}: frontmatter must close`)
      const block = lines.slice(1, close)
      const nameLine = block.find((l) => l.startsWith('name:'))
      const descLine = block.find((l) => l.startsWith('description:'))
      assert.ok(nameLine, `${file}: name present`)
      assert.ok(descLine, `${file}: description present`)
      assert.ok(
        !descLine.includes('HAUS-MANAGED'),
        `${file}: description must be real, not the ownership marker`,
      )
    }
  })

  it('marks installed skills as haus-owned (parseMarkdownHeader finds the field)', async () => {
    const { applyInstall } = await import('../src/install/apply.js')
    const { parseMarkdownHeader } = await import('../src/install/header.js')
    await applyInstall({})

    for (const file of listSkillFiles(claudeDir)) {
      const header = parseMarkdownHeader(fs.readFileSync(file, 'utf8'))
      assert.ok(header, `${file}: ownership marker must be parseable`)
      assert.ok(header.stableId.startsWith('skill.'), `${file}: stableId is a skill id`)
    }
  })
})

describe('global install — skill ownership guard (ADR-0006)', () => {
  let tmpDir
  let claudeDir
  let prevHome
  let prevUserProfile

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-skill-own-'))
    prevHome = process.env.HOME
    prevUserProfile = process.env.USERPROFILE
    process.env.HOME = tmpDir
    process.env.USERPROFILE = tmpDir
    claudeDir = path.join(tmpDir, '.claude')
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('re-install is a no-op; user edits are preserved; --force overwrites', async () => {
    const { applyInstall } = await import('../src/install/apply.js')

    const created = await applyInstall({})
    const skill = listSkillFiles(claudeDir)[0]
    assert.ok(skill, 'a skill was installed')
    assert.ok(created.created.includes(skill), 'skill reported as created')

    // Re-install unchanged → skipped (hash matches), file identical.
    const before = fs.readFileSync(skill, 'utf8')
    const second = await applyInstall({})
    assert.ok(second.skipped.includes(skill), 'unchanged skill is skipped on re-install')
    assert.equal(fs.readFileSync(skill, 'utf8'), before, 'unchanged skill not rewritten')

    // User edits the body → re-install must NOT clobber it without --force.
    const edited = `${before}\n<!-- user note -->\n`
    fs.writeFileSync(skill, edited)
    const third = await applyInstall({})
    assert.ok(third.skipped.includes(skill), 'user-edited skill is skipped')
    assert.equal(fs.readFileSync(skill, 'utf8'), edited, 'user edit preserved')

    // --force restores the managed content.
    const forced = await applyInstall({ force: true })
    assert.ok(forced.updated.includes(skill), 'force overwrites the user-edited skill')
    assert.equal(fs.readFileSync(skill, 'utf8'), before, 'managed content restored')
  })
})
