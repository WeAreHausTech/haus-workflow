// tests/workspace-members.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  readMembers,
  MemberConfigError,
  REPOS_MANIFEST_FILE,
  REPOS_LOCAL_FILE,
} from '../src/workspace/members.ts'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haus-members-'))
}

/** Minimal stand-in for `RootInfo` — readMembers only reads `mainRoot`. */
function fakeRootInfo(mainRoot) {
  return {
    cwd: mainRoot,
    repoRoot: mainRoot,
    gitDir: path.join(mainRoot, '.git'),
    gitCommonDir: path.join(mainRoot, '.git'),
    isLinkedWorktree: false,
    mainRoot,
    worktreeName: null,
    isGitRepo: true,
  }
}

test('readMembers works against a haus.workspace.yaml-only workspace', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, 'haus.workspace.yaml'),
      [
        'client: acme',
        'repos:',
        '  - name: storefront',
        '    path: storefront',
        '    role: frontend',
        '  - name: cms',
        '    path: cms',
        '    role: backend',
        'relationships: []',
        '',
      ].join('\n'),
    )

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 2)
    assert.deepEqual(
      members.map((m) => m.id).sort(),
      ['cms', 'storefront'],
    )
    for (const m of members) {
      assert.equal(m.source, 'haus.workspace.yaml')
      assert.equal(m.absPath, path.resolve(ws, m.folder))
      assert.equal(m.url, undefined)
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers works against a repos.manifest.json-only workspace', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, REPOS_MANIFEST_FILE),
      JSON.stringify({
        repos: [
          { id: 'storefront', folder: 'storefront', repo: 'git@github.com:acme/storefront.git' },
          { id: 'cms', folder: 'cms', repo: 'git@github.com:acme/cms.git' },
        ],
      }),
    )

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 2)
    const byId = Object.fromEntries(members.map((m) => [m.id, m]))
    assert.equal(byId.storefront.source, 'repos.manifest.json')
    assert.equal(byId.storefront.folder, 'storefront')
    assert.equal(byId.storefront.url, 'git@github.com:acme/storefront.git')
    assert.equal(byId.storefront.absPath, path.resolve(ws, 'storefront'))
    assert.equal(byId.cms.url, 'git@github.com:acme/cms.git')
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers prefers haus.workspace.yaml over repos.manifest.json when both are present', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, 'haus.workspace.yaml'),
      ['client: acme', 'repos:', '  - name: from-yaml', '    path: yaml-folder', ''].join('\n'),
    )
    fs.writeFileSync(
      path.join(ws, REPOS_MANIFEST_FILE),
      JSON.stringify({ repos: [{ id: 'from-manifest', folder: 'manifest-folder' }] }),
    )

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 1)
    assert.equal(members[0].id, 'from-yaml')
    assert.equal(members[0].source, 'haus.workspace.yaml')
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers returns an empty array when neither config file exists', async () => {
  const ws = tmpDir()
  try {
    const members = await readMembers(fakeRootInfo(ws))
    assert.deepEqual(members, [])
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers honors repos.local.json pathOverrides against a haus.workspace.yaml source', async () => {
  const ws = tmpDir()
  const elsewhere = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, 'haus.workspace.yaml'),
      ['client: acme', 'repos:', '  - name: storefront', '    path: storefront', ''].join('\n'),
    )
    fs.writeFileSync(
      path.join(ws, REPOS_LOCAL_FILE),
      JSON.stringify({ pathOverrides: { storefront: elsewhere } }),
    )

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 1)
    assert.equal(members[0].absPath, elsewhere, 'override wins over workspaceRoot/folder join')
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(elsewhere, { recursive: true, force: true })
  }
})

test('readMembers honors repos.local.json pathOverrides against a repos.manifest.json source', async () => {
  const ws = tmpDir()
  const elsewhere = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, REPOS_MANIFEST_FILE),
      JSON.stringify({ repos: [{ id: 'cms', folder: 'cms' }] }),
    )
    fs.writeFileSync(
      path.join(ws, REPOS_LOCAL_FILE),
      JSON.stringify({ pathOverrides: { cms: elsewhere } }),
    )

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 1)
    assert.equal(members[0].absPath, elsewhere)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(elsewhere, { recursive: true, force: true })
  }
})

test('readMembers throws MemberConfigError on malformed haus.workspace.yaml, never a silent empty list', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(path.join(ws, 'haus.workspace.yaml'), 'repos: [ this: is, : broken\n  -\n')
    await assert.rejects(() => readMembers(fakeRootInfo(ws)), MemberConfigError)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers throws MemberConfigError on malformed repos.manifest.json JSON', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(path.join(ws, REPOS_MANIFEST_FILE), '{ not valid json')
    await assert.rejects(() => readMembers(fakeRootInfo(ws)), MemberConfigError)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers throws MemberConfigError when repos.manifest.json "repos" is not an array', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(path.join(ws, REPOS_MANIFEST_FILE), JSON.stringify({ repos: 'nope' }))
    await assert.rejects(() => readMembers(fakeRootInfo(ws)), MemberConfigError)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers throws MemberConfigError when a manifest entry is missing id/folder', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, REPOS_MANIFEST_FILE),
      JSON.stringify({ repos: [{ id: 'storefront' }] }),
    )
    await assert.rejects(() => readMembers(fakeRootInfo(ws)), MemberConfigError)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers throws MemberConfigError on malformed repos.local.json, never a silent empty list', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, 'haus.workspace.yaml'),
      ['client: acme', 'repos:', '  - name: storefront', '    path: storefront', ''].join('\n'),
    )
    fs.writeFileSync(path.join(ws, REPOS_LOCAL_FILE), '{ broken')
    await assert.rejects(() => readMembers(fakeRootInfo(ws)), MemberConfigError)
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})

test('readMembers tolerates a repos.local.json with no pathOverrides key', async () => {
  const ws = tmpDir()
  try {
    fs.writeFileSync(
      path.join(ws, REPOS_MANIFEST_FILE),
      JSON.stringify({ repos: [{ id: 'cms', folder: 'cms' }] }),
    )
    fs.writeFileSync(path.join(ws, REPOS_LOCAL_FILE), JSON.stringify({ somethingElse: true }))

    const members = await readMembers(fakeRootInfo(ws))
    assert.equal(members.length, 1)
    assert.equal(members[0].absPath, path.resolve(ws, 'cms'))
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
})
