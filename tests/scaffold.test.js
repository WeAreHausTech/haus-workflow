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
