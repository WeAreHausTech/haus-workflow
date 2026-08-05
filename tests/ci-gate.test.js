import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execaSync } from 'execa'

// Exempt these tests from `apply`'s empty-cache check by pointing at the
// vendored fixture catalog. Child processes inherit this env.
process.env.HAUS_FIXTURE_CATALOG = path.resolve('tests/fixtures/catalog/manifest.json')

const cli = path.resolve('dist/cli.js')

// Matches the env update.test.js uses to keep `update --check` network-free and
// deterministic in CI: a dead local port for the catalog remote, an isolated cache
// dir, and an isolated HOME so npm-version lookups don't touch the real filesystem.
function updateSafeEnv(temp) {
  return {
    ...process.env,
    HAUS_TEST_MODE: '1',
    HAUS_CATALOG_CACHE_DIR_OVERRIDE: path.join(temp, 'cache'),
    HAUS_CATALOG_REMOTE_BASE: 'http://127.0.0.1:0',
    HOME: path.join(temp, 'home'),
    USERPROFILE: path.join(temp, 'home'),
  }
}

// `apply --write` fetches real template content (WORKFLOW.md) that isn't gated by
// HAUS_CATALOG_REMOTE_BASE the way ref/tag lookups are (see
// src/catalog/remote-catalog/ref.ts, github-tree.ts) — pointing it at the dead port
// used to keep `update --check` network-free would make apply itself fail. So scan
// /recommend/apply run with plain env (matching tests/doctor.test.js's own setup);
// only the later `update --check` / `ci-gate` calls get the network-free override.
function setUpHealthyProject(temp) {
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify(
      { name: 'ci-gate-healthy', packageManager: 'yarn@4.5.3', dependencies: { react: '19.0.0' } },
      null,
      2,
    ),
  )
  writeFileSync(path.join(temp, 'yarn.lock'), '# lock')
  execaSync('node', [cli, 'scan', '--json'], { cwd: temp })
  execaSync('node', [cli, 'recommend', '--json'], { cwd: temp })
  execaSync('node', [cli, 'apply', '--write'], { cwd: temp })
  return updateSafeEnv(temp)
}

test('ci-gate passes and reports PASS for all three checks on a healthy project', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-healthy-'))
  const env = setUpHealthyProject(temp)

  const r = execaSync('node', [cli, 'ci-gate'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 0)
  assert.match(r.stdout, /doctor:\s+PASS/)
  assert.match(r.stdout, /decisions:\s+PASS/)
  assert.match(r.stdout, /update:\s+PASS/)
  assert.match(r.stdout, /all checks passed/)
})

test('ci-gate --json emits {doctor, decisions, update, ok} with ok:true on a healthy project', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-json-'))
  const env = setUpHealthyProject(temp)

  const r = execaSync('node', [cli, 'ci-gate', '--json'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 0)
  // Nothing from the three captured checks' own console output should leak ahead of
  // the single aggregate JSON.stringify call — if console-swapping ever failed to
  // take effect, a check's raw print (e.g. doctor's own title line) would land in
  // stdout before the JSON blob and this would fail before JSON.parse even runs.
  assert.equal(
    r.stdout.trim().startsWith('{'),
    true,
    `expected stdout to start with '{'; got: ${r.stdout.slice(0, 200)}`,
  )
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.ok, true)
  for (const key of ['doctor', 'decisions', 'update']) {
    assert.equal(
      parsed[key].ok,
      true,
      `expected ${key}.ok === true; got ${JSON.stringify(parsed[key])}`,
    )
    assert.equal(Array.isArray(parsed[key].output), true)
  }
})

test('ci-gate fails and names doctor when the project was never set up', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-unset-up-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'ci-gate-unset-up', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = updateSafeEnv(temp)

  const r = execaSync('node', [cli, 'ci-gate'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 1)
  assert.match(r.stdout, /doctor:\s+FAIL/)
  assert.match(r.stdout + r.stderr, /one or more checks failed/)
  assert.match(r.stdout + r.stderr, /--- doctor ---/)
})

test('ci-gate --json reports ok:false and doctor.ok:false when the project was never set up', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-unset-up-json-'))
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'ci-gate-unset-up-json', packageManager: 'yarn@4.5.3' }, null, 2),
  )
  const env = updateSafeEnv(temp)

  const r = execaSync('node', [cli, 'ci-gate', '--json'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.doctor.ok, false)
})

test('ci-gate fails and names decisions when a decision-worthy change lacks an ADR, while doctor and update pass', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-decisions-fail-'))
  const env = setUpHealthyProject(temp)

  execaSync('git', ['init', '-q'], { cwd: temp })
  execaSync('git', ['config', 'user.email', 'test@example.com'], { cwd: temp })
  execaSync('git', ['config', 'user.name', 'test'], { cwd: temp })
  execaSync('git', ['add', '-A'], { cwd: temp })
  execaSync('git', ['commit', '-qm', 'init'], { cwd: temp })

  // package.json is one of the decisions-gate's trigger globs (library/catalog/
  // decisions-triggers.json) — a single-file match, no line-count threshold needed.
  // Left unstaged/uncommitted so `decisions check`'s default unstaged-diff-vs-HEAD
  // picks it up with no matching ADR present.
  const pkgPath = path.join(temp, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'left-pad': '1.0.0' }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  const r = execaSync('node', [cli, 'ci-gate', '--json'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(
    parsed.decisions.ok,
    false,
    `expected decisions.ok === false; got ${JSON.stringify(parsed.decisions)}`,
  )
  assert.equal(
    parsed.doctor.ok,
    true,
    `expected doctor.ok === true; got ${JSON.stringify(parsed.doctor)}`,
  )
  assert.equal(
    parsed.update.ok,
    true,
    `expected update.ok === true; got ${JSON.stringify(parsed.update)}`,
  )
  assert.equal(parsed.ok, false)
})

test('ci-gate fails and names update when a formerIds migration is pending, while doctor and decisions pass', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-update-fail-'))
  const env = setUpHealthyProject(temp)

  const lock = JSON.parse(readFileSync(path.join(temp, '.haus-workflow/haus.lock.json'), 'utf8'))
  const existingId = lock[0].id

  // A standalone manifest, swapped in via HAUS_FIXTURE_CATALOG only for this one
  // `ci-gate` invocation — doctor and decisions never read the catalog manifest, so
  // this isolates the failure to `update --check --fast`'s formerIds-migration path.
  const migrationManifest = path.join(temp, 'migration-manifest.json')
  writeFileSync(
    migrationManifest,
    JSON.stringify({ items: [{ id: `${existingId}-renamed`, formerIds: [existingId] }] }, null, 2),
  )

  const r = execaSync('node', [cli, 'ci-gate', '--json'], {
    cwd: temp,
    env: { ...env, HAUS_FIXTURE_CATALOG: migrationManifest },
    reject: false,
  })
  assert.equal(r.exitCode, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(
    parsed.update.ok,
    false,
    `expected update.ok === false; got ${JSON.stringify(parsed.update)}`,
  )
  assert.equal(
    parsed.doctor.ok,
    true,
    `expected doctor.ok === true; got ${JSON.stringify(parsed.doctor)}`,
  )
  assert.equal(
    parsed.decisions.ok,
    true,
    `expected decisions.ok === true; got ${JSON.stringify(parsed.decisions)}`,
  )
  assert.equal(parsed.ok, false)
})

// Regression for the fix in this PR: a thrown exception from one of the three
// underlying commands (not just a nonzero process.exitCode) must not abort the other
// two checks, must not crash `ci-gate` itself, and must still produce parseable JSON.
test('ci-gate captures a thrown error into a structured failure instead of crashing or discarding other results', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-throw-'))
  const env = setUpHealthyProject(temp)

  // Both doctor and update read .haus-workflow/haus.lock.json via readJson, which
  // rethrows any fs error other than ENOENT. Replacing the file with a directory of
  // the same name makes `fs.readFile` throw EISDIR in both — a real, if narrow, path
  // (see e.g. doctor.ts's own pathExists-then-readFile TOCTOU) rather than a synthetic
  // one, exercised here without needing to race an actual concurrent mutation.
  const lockPath = path.join(temp, '.haus-workflow/haus.lock.json')
  rmSync(lockPath)
  mkdirSync(lockPath)

  const r = execaSync('node', [cli, 'ci-gate', '--json'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 1)
  assert.equal(
    r.stdout.trim().startsWith('{'),
    true,
    `expected valid JSON on stdout; got: ${r.stdout.slice(0, 200)}\nstderr: ${r.stderr.slice(0, 200)}`,
  )
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.ok, false)
  assert.equal(
    parsed.doctor.ok,
    false,
    `expected doctor.ok === false; got ${JSON.stringify(parsed.doctor)}`,
  )
  assert.equal(
    parsed.update.ok,
    false,
    `expected update.ok === false; got ${JSON.stringify(parsed.update)}`,
  )
  assert.equal(
    parsed.decisions.ok,
    true,
    `decisions never reads the lockfile and should be unaffected; got ${JSON.stringify(parsed.decisions)}`,
  )
  assert.ok(
    parsed.doctor.output.some((line) => /EISDIR|illegal operation|directory/i.test(line)),
    `expected doctor's captured output to include the thrown error's message; got ${JSON.stringify(parsed.doctor.output)}`,
  )
})

// Regression: `checkDecisions` calls `runDecisionsCheck` directly (not through the
// console-capture path `doctor`/`update` use), so it needs its own try/catch around a
// thrown error — this failed the same way as the lockfile case above until fixed.
test('ci-gate captures a thrown error from decisions check into a structured failure, without crashing or discarding other results', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-decisions-throw-'))
  const env = setUpHealthyProject(temp)

  // runDecisionsCheck's first step reads .haus-workflow/adr-gate.json via readJson,
  // which rethrows any fs error other than ENOENT — same EISDIR mechanism as above,
  // scoped to decisions specifically since doctor/update never read this file.
  mkdirSync(path.join(temp, '.haus-workflow/adr-gate.json'))

  const r = execaSync('node', [cli, 'ci-gate', '--json'], { cwd: temp, env, reject: false })
  assert.equal(r.exitCode, 1)
  assert.equal(
    r.stdout.trim().startsWith('{'),
    true,
    `expected valid JSON on stdout; got: ${r.stdout.slice(0, 200)}\nstderr: ${r.stderr.slice(0, 200)}`,
  )
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.ok, false)
  assert.equal(
    parsed.decisions.ok,
    false,
    `expected decisions.ok === false; got ${JSON.stringify(parsed.decisions)}`,
  )
  assert.equal(
    parsed.doctor.ok,
    true,
    `expected doctor.ok === true; got ${JSON.stringify(parsed.doctor)}`,
  )
  assert.equal(
    parsed.update.ok,
    true,
    `expected update.ok === true; got ${JSON.stringify(parsed.update)}`,
  )
  assert.ok(
    parsed.decisions.output.some((line) => /EISDIR|illegal operation|directory/i.test(line)),
    `expected decisions' captured output to include the thrown error's message; got ${JSON.stringify(parsed.decisions.output)}`,
  )
})

// Regression: aggregating the three checks into one command must not change any of
// their own independent behavior — each remains runnable standalone with its
// pre-existing exit-code contract, before and after a ci-gate run in the same project.
test('doctor, decisions check, and update --check remain independently runnable with unchanged exit codes after ci-gate runs', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haus-ci-gate-independent-'))
  const env = setUpHealthyProject(temp)

  const doctorBefore = execaSync('node', [cli, 'doctor'], { cwd: temp, env, reject: false })
  const decisionsBefore = execaSync('node', [cli, 'decisions', 'check'], {
    cwd: temp,
    env,
    reject: false,
  })
  const updateBefore = execaSync('node', [cli, 'update', '--check', '--fast'], {
    cwd: temp,
    env,
    reject: false,
  })

  execaSync('node', [cli, 'ci-gate'], { cwd: temp, env, reject: false })

  const doctorAfter = execaSync('node', [cli, 'doctor'], { cwd: temp, env, reject: false })
  const decisionsAfter = execaSync('node', [cli, 'decisions', 'check'], {
    cwd: temp,
    env,
    reject: false,
  })
  const updateAfter = execaSync('node', [cli, 'update', '--check', '--fast'], {
    cwd: temp,
    env,
    reject: false,
  })

  assert.equal(doctorAfter.exitCode, doctorBefore.exitCode)
  assert.equal(decisionsAfter.exitCode, decisionsBefore.exitCode)
  assert.equal(updateAfter.exitCode, updateBefore.exitCode)
})
