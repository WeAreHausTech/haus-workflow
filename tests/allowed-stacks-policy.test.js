import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('allowed-stacks includes canonical machine-stable tokens', () => {
  const raw = fs.readFileSync('library/catalog/validation-rules.json', 'utf8')
  const parsed = JSON.parse(raw)
  const stacks = new Set((parsed.allowedStacks ?? []).map((x) => String(x)))

  const required = [
    'expressjs',
    'wisest',
    'dotnet',
    'wordpress',
    'bedrock',
    'laravel-nova',
    'vendure3',
    'nestjs',
    'graphql',
    'nx21',
    'turbo',
    'nextjs',
    'react19',
    'vite8',
    'typescript5',
    'tanstack-query',
    'tanstack-router',
    'radix-ui',
    'shadcn-ui',
    'tailwindcss',
    'scss-modules',
    'vue',
    'postgresql',
    'mariadb',
    'mssql',
    'elasticsearch',
    'yarn4',
    'pnpm89',
    'playwright',
    'testing-library',
    'phpunit',
    'storybook',
  ]

  for (const token of required) {
    assert.equal(stacks.has(token), true, `missing required token: ${token}`)
  }
})
