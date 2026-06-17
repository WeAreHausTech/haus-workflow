import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import { scaffoldConfigItems } from '../src/install/scaffold.js'

describe('scaffoldConfigItems', () => {
  let tmpDir
  let catalogRoot

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-scaffold-test-'))
    catalogRoot = path.join(tmpDir, 'catalog')
    fs.mkdirSync(path.join(catalogRoot, 'configs', 'eslint'), { recursive: true })
    fs.writeFileSync(
      path.join(catalogRoot, 'configs', 'eslint', 'eslint.config.js'),
      '// eslint config\n',
    )
    fs.mkdirSync(path.join(catalogRoot, 'configs', 'prettier'), { recursive: true })
    fs.writeFileSync(
      path.join(catalogRoot, 'configs', 'prettier', 'prettier.config.cjs'),
      '// prettier config\n',
    )
    fs.writeFileSync(path.join(catalogRoot, 'configs', 'prettier', '.prettierignore'), 'dist\n')
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('copies a single-file config item to the project root', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.eslint-config',
          type: 'config',
          path: 'configs/eslint/eslint.config.js',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      const dest = path.join(projectRoot, 'eslint.config.js')
      assert.ok(fs.existsSync(dest), 'eslint.config.js should exist in project root')
      assert.equal(result.scaffolded.length, 1)
      assert.equal(result.skipped.length, 0)
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('skips a file that already exists and is different (no overwrite)', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    fs.writeFileSync(path.join(projectRoot, 'eslint.config.js'), '// custom config\n')
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.eslint-config',
          type: 'config',
          path: 'configs/eslint/eslint.config.js',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      const content = fs.readFileSync(path.join(projectRoot, 'eslint.config.js'), 'utf8')
      assert.equal(content, '// custom config\n', 'existing file must not be overwritten')
      assert.equal(result.scaffolded.length, 0)
      assert.equal(result.skipped.length, 1)
      assert.deepEqual(result.skippedExisting, ['eslint.config.js'], 'existing skip is --force-able')
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('copies all files of a directory-type item, including dotfiles', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.prettier-config',
          type: 'config',
          path: 'configs/prettier',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.ok(fs.existsSync(path.join(projectRoot, 'prettier.config.cjs')))
      assert.ok(
        fs.existsSync(path.join(projectRoot, '.prettierignore')),
        'dotfile must be copied',
      )
      assert.equal(result.scaffolded.length, 2)
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('allows a file whose name begins with ".." (not a traversal segment)', async () => {
    fs.writeFileSync(path.join(catalogRoot, 'configs', 'eslint', '..eslintrc'), 'legacy\n')
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.legacy',
          type: 'config',
          path: 'configs/eslint/..eslintrc',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.equal(result.scaffolded.length, 1)
      assert.ok(fs.existsSync(path.join(projectRoot, '..eslintrc')))
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('refuses to scaffold a symlinked source', async (t) => {
    const outside = path.join(tmpDir, 'secret.txt')
    fs.writeFileSync(outside, 'TOP SECRET\n')
    const linkPath = path.join(catalogRoot, 'configs', 'evil-link')
    try {
      fs.symlinkSync(outside, linkPath)
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'ENOSYS') {
        t.skip('symlinks not supported in this environment')
        return
      }
      throw err
    }
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.evil',
          type: 'config',
          path: 'configs/evil-link',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.equal(result.scaffolded.length, 0)
      assert.equal(result.skippedExisting.length, 0, 'refused symlink is not a --force-able skip')
      assert.ok(!fs.existsSync(path.join(projectRoot, 'evil-link')))
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
      fs.rmSync(linkPath, { force: true })
    }
  })

  it('copies a subdirectory entry whole but never replicates a nested symlink', async (t) => {
    const dirItem = path.join(catalogRoot, 'configs', 'withsub')
    fs.mkdirSync(path.join(dirItem, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(dirItem, 'top.cjs'), 'top\n')
    fs.writeFileSync(path.join(dirItem, 'nested', 'inner.cjs'), 'inner\n')
    const outside = path.join(tmpDir, 'outside-secret.txt')
    fs.writeFileSync(outside, 'SECRET\n')
    try {
      fs.symlinkSync(outside, path.join(dirItem, 'nested', 'link.cjs'))
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'ENOSYS') {
        fs.rmSync(dirItem, { recursive: true, force: true })
        t.skip('symlinks not supported in this environment')
        return
      }
      throw err
    }
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.withsub',
          type: 'config',
          path: 'configs/withsub',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.ok(fs.existsSync(path.join(projectRoot, 'top.cjs')), 'top-level file copied')
      assert.ok(
        fs.existsSync(path.join(projectRoot, 'nested', 'inner.cjs')),
        'nested subdir file copied whole',
      )
      assert.ok(
        !fs.existsSync(path.join(projectRoot, 'nested', 'link.cjs')),
        'nested symlink must not be replicated',
      )
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
      fs.rmSync(dirItem, { recursive: true, force: true })
    }
  })

  it('skips an item whose parent directory is a symlink escaping the root', async (t) => {
    const target = path.join(tmpDir, 'outside-dir')
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'hosts'), 'ROOT:x:0:0\n')
    const linkParent = path.join(catalogRoot, 'configs', 'evil-parent')
    try {
      fs.symlinkSync(target, linkParent)
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'ENOSYS') {
        t.skip('symlinks not supported in this environment')
        return
      }
      throw err
    }
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.evil-parent',
          type: 'config',
          path: 'configs/evil-parent/hosts',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.equal(result.scaffolded.length, 0)
      assert.ok(!fs.existsSync(path.join(projectRoot, 'hosts')), 'must not read through parent symlink')
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
      fs.rmSync(linkParent, { force: true })
    }
  })

  it('force replaces a destination of the wrong type', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    // Pre-existing dest is a directory where the source is a file.
    fs.mkdirSync(path.join(projectRoot, 'eslint.config.js'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'eslint.config.js', 'stale.txt'), 'stale\n')
    try {
      const result = await scaffoldConfigItems(
        projectRoot,
        catalogRoot,
        [
          {
            id: 'haus.eslint-config',
            type: 'config',
            path: 'configs/eslint/eslint.config.js',
            source: 'haus',
            tags: [],
            repoRoles: [],
            tokenEstimate: 0,
          },
        ],
        { force: true },
      )
      assert.equal(result.scaffolded.length, 1)
      const dest = path.join(projectRoot, 'eslint.config.js')
      assert.ok(fs.statSync(dest).isFile(), 'dir dest must be replaced by a file')
      assert.equal(fs.readFileSync(dest, 'utf8'), '// eslint config\n')
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('skips an item whose path escapes the catalog root', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(projectRoot, catalogRoot, [
        {
          id: 'haus.evil',
          type: 'config',
          path: '../../../../etc/hosts',
          source: 'haus',
          tags: [],
          repoRoles: [],
          tokenEstimate: 0,
        },
      ])
      assert.equal(result.scaffolded.length, 0)
      assert.equal(result.skipped.length, 0)
      assert.ok(!fs.existsSync(path.join(projectRoot, 'hosts')))
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('dry-run reports would-be files without writing them', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    try {
      const result = await scaffoldConfigItems(
        projectRoot,
        catalogRoot,
        [
          {
            id: 'haus.eslint-config',
            type: 'config',
            path: 'configs/eslint/eslint.config.js',
            source: 'haus',
            tags: [],
            repoRoles: [],
            tokenEstimate: 0,
          },
        ],
        { dryRun: true },
      )
      assert.equal(result.scaffolded.length, 1)
      assert.ok(
        !fs.existsSync(path.join(projectRoot, 'eslint.config.js')),
        'dry-run must not write any file',
      )
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('overwrites when force: true', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-project-'))
    fs.writeFileSync(path.join(projectRoot, 'eslint.config.js'), '// custom config\n')
    try {
      const result = await scaffoldConfigItems(
        projectRoot,
        catalogRoot,
        [
          {
            id: 'haus.eslint-config',
            type: 'config',
            path: 'configs/eslint/eslint.config.js',
            source: 'haus',
            tags: [],
            repoRoles: [],
            tokenEstimate: 0,
          },
        ],
        { force: true },
      )
      const content = fs.readFileSync(path.join(projectRoot, 'eslint.config.js'), 'utf8')
      assert.equal(content, '// eslint config\n')
      assert.equal(result.scaffolded.length, 1)
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
