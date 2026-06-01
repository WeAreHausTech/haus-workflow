import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneFixtureToTemp, runHaus } from './helpers/fixture-runner.js'

function classifyViaCli(cwd, task) {
  const output = runHaus(cwd, `context --task "${task}" --json`)
  const parsed = JSON.parse(output)
  return [...parsed.taskIntents].sort()
}

// One fixture is enough; we are exercising classifier behavior, not selection.
const cases = [
  { task: 'write unit-test for cart helper', mustInclude: ['testing'] },
  { task: 'add e2e-test coverage', mustInclude: ['testing'] },
  { task: 'update docs: getting started', mustInclude: ['docs'] },
  { task: 'tanstack.query mutation in dashboard', mustInclude: ['frontend'] },
  { task: 'build dashboard route', mustInclude: ['frontend'] },
  { task: 'build shipping plugin', mustInclude: ['backend'] },
  { task: 'create graphql resolver', mustInclude: ['backend', 'graphql'] },
  { task: 'add tanstack query mutation', mustInclude: ['frontend'] },
  { task: 'add api mutation handler', mustInclude: ['backend'] },
  { task: 'add graphql mutation resolver', mustInclude: ['backend', 'graphql'] },
  { task: 'create new lib in nx workspace', mustInclude: ['monorepo'] },
  { task: 'configure pnpm-workspace', mustInclude: ['monorepo'] },
  { task: 'wire bankid login flow', mustInclude: ['auth'] },
  { task: 'next.js route refactor', mustInclude: ['frontend'] },
]

test('classifier punctuation + word-boundary handling', () => {
  const cwd = cloneFixtureToTemp('nextjs-app')
  runHaus(cwd, 'scan --json')
  runHaus(cwd, 'recommend --json')
  for (const c of cases) {
    const intents = classifyViaCli(cwd, c.task)
    for (const intent of c.mustInclude) {
      assert.equal(
        intents.includes(intent),
        true,
        `task "${c.task}" must include "${intent}", got [${intents.join(', ')}]`,
      )
    }
  }
})

test('nx keyword does not bleed into nextjs tasks', () => {
  const cwd = cloneFixtureToTemp('nextjs-app')
  runHaus(cwd, 'scan --json')
  runHaus(cwd, 'recommend --json')
  const intents = classifyViaCli(cwd, 'build a nextjs page')
  assert.equal(intents.includes('monorepo'), false)
})
