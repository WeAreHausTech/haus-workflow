import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  FORBIDDEN_TAGS,
  RISKY_INSTALL_PATTERNS,
  ALLOWED_NPX_PATTERN,
  ANY_NPX_PATTERN,
  HTTP_URL_PATTERN,
  PLACEHOLDER_PATTERN,
  ALLOWED_STACKS,
  ALWAYS_ALLOWED_TAGS,
  PATTERN_TAG_SUFFIXES,
  SKILL_SECTION_EXEMPT_SOURCES,
  isTagAllowed,
  auditDisallowedTags,
} from '../src/catalog/validation-rules.ts'

test('loader reconstructs regex objects from the {source,flags} JSON form', () => {
  assert.ok(RISKY_INSTALL_PATTERNS.every((r) => r instanceof RegExp))
  assert.ok(ALLOWED_NPX_PATTERN instanceof RegExp)
  // Behavior preserved from the original hand-written regexes.
  assert.equal(RISKY_INSTALL_PATTERNS.some((r) => r.test('run npx -y create-app')), true)
  assert.equal(ALLOWED_NPX_PATTERN.test('npx tsx script.ts'), true)
  assert.equal(ANY_NPX_PATTERN.test('npx anything'), true)
  assert.equal(HTTP_URL_PATTERN.test('http://insecure.example'), true)
  assert.equal(HTTP_URL_PATTERN.test('https://secure.example'), false)
  assert.equal(PLACEHOLDER_PATTERN.test('this is a TODO'), true)
})

test('forbidden tags load from the canonical JSON', () => {
  assert.ok(FORBIDDEN_TAGS.includes('python'))
  assert.ok(FORBIDDEN_TAGS.includes('rust'))
})

test('isTagAllowed accepts stacks, meta tags, and pattern suffixes; rejects unknown', () => {
  assert.equal(isTagAllowed('react'), true) // stack
  assert.equal(isTagAllowed('REVIEW'), true) // case-insensitive
  assert.equal(isTagAllowed('baseline'), true) // always-allowed meta tag (not in allowedStacks)
  assert.equal(isTagAllowed('project-instructions'), true)
  assert.equal(isTagAllowed('react-patterns'), true) // pattern suffix
  assert.equal(isTagAllowed('totally-unknown-stack'), false)
})

test('auditDisallowedTags flags only the unknown tag', () => {
  const items = [{ id: 'a', tags: ['react', 'review', 'bogus-stack', 'foo-patterns'] }]
  assert.deepEqual(auditDisallowedTags(items), ['a: tag not in allowlist: "bogus-stack"'])
})

test('baseline + project-instructions are NOT in allowedStacks but ARE always-allowed', () => {
  // Guards the WS8 invariant: specials live in alwaysAllowedTags, not the stack list.
  assert.equal(ALLOWED_STACKS.includes('baseline'), false)
  assert.equal(ALWAYS_ALLOWED_TAGS.includes('baseline'), true)
  assert.equal(PATTERN_TAG_SUFFIXES.includes('-patterns'), true)
})

test('CLI fixture has every required key (a malformed sync would drop one)', () => {
  const json = JSON.parse(fs.readFileSync('library/catalog/validation-rules.json', 'utf8'))
  // Required keys present — a malformed sync would drop one.
  for (const key of [
    'forbiddenTags',
    'bannedAgentPhrases',
    'requiredSkillSections',
    'requiredAgentSections',
    'riskyInstallPatterns',
    'allowedNpxPattern',
    'anyNpxPattern',
    'httpUrlPattern',
    'placeholderPattern',
    'allowedStacks',
    'alwaysAllowedTags',
    'patternTagSuffixes',
    'skillSectionExemptSources',
  ]) {
    assert.ok(key in json, `missing key in fixture: ${key}`)
  }
})

test('skillSectionExemptSources loads curated from the canonical JSON', () => {
  assert.deepEqual([...SKILL_SECTION_EXEMPT_SOURCES], ['curated'])
})
