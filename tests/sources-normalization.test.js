import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import YAML from 'yaml'

test('sources.yaml matches canonical source set', () => {
  const raw = fs.readFileSync('library/catalog/sources.yaml', 'utf8')
  const parsed = YAML.parse(raw)
  const ids = new Set((parsed.sources ?? []).map((item) => item.id))

  const expected = [
    'anthropic-skills',
    'superpowers',
    'ecc',
    'skills-sh',
    'prpm',
    'jeffallan-skills',
    'skillkit',
  ]
  for (const id of expected) {
    assert.equal(ids.has(id), true, `missing canonical source id: ${id}`)
  }
  assert.equal(ids.has('agenstskills'), false, 'deprecated source id should be removed')
})
