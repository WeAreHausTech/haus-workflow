import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { friendlyRole, describeRepo } from '../src/scanner/role-labels.ts'

const ctx = (over = {}) => ({
  repoName: 'demo',
  packageManager: 'yarn',
  repoRoles: [],
  detectionStatus: 'supported',
  unsupportedSignals: [],
  ...over,
})

describe('role-labels: friendlyRole', () => {
  it('maps known roles to plain labels', () => {
    assert.equal(friendlyRole('next-app'), 'a Next.js app')
    assert.equal(friendlyRole('vendure-plugin'), 'a Vendure plugin')
    assert.equal(friendlyRole('wordpress-bedrock-site'), 'a WordPress (Bedrock) site')
  })

  it('humanises unknown roles with a/an article', () => {
    assert.equal(friendlyRole('foo-bar'), 'a foo bar')
    assert.equal(friendlyRole('elixir-service'), 'an elixir service')
  })
})

describe('role-labels: describeRepo', () => {
  it('describes a single recognised role with the package manager', () => {
    const text = describeRepo(ctx({ repoRoles: ['next-app'], packageManager: 'yarn' }))
    assert.match(text, /a Next\.js app/)
    assert.match(text, /yarn/)
  })

  it('joins multiple roles with "and"', () => {
    const text = describeRepo(ctx({ repoRoles: ['next-app', 'graphql-api'] }))
    assert.match(text, /a Next\.js app and a GraphQL API/)
  })

  it('is honest when the stack is unknown', () => {
    const text = describeRepo(
      ctx({ detectionStatus: 'unknown', unsupportedSignals: ['python'], repoRoles: [] }),
    )
    assert.match(text, /couldn't fully recognise/i)
    assert.match(text, /python/)
  })

  it('flags partial support alongside recognised roles', () => {
    const text = describeRepo(
      ctx({ detectionStatus: 'partial', repoRoles: ['next-app'], unsupportedSignals: ['go'] }),
    )
    assert.match(text, /a Next\.js app/)
    assert.match(text, /doesn't fully support/i)
    assert.match(text, /go/)
  })
})
