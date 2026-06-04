# Runbook

One entry per non-obvious failure resolved. Append-only.

## validation-rules.json drift (contract-check FAIL)

**Symptom:** `contract-check.mjs` BP#1 reports
`validation-rules.json DRIFT vs live catalog`, or the `Contract drift` workflow
fails on main/cron. **Cause:** the catalog repo changed `validation-rules.json`
and the synced copy in this repo (`library/catalog/validation-rules.json`) is
stale. **Fix:** run the catalog sync to refresh the committed copy and merge the
resulting sync PR (the same mechanism that syncs `manifest.json`; see ADR-0001).
Re-run `node scripts/contract-check.mjs` to confirm BP#1 passes.

## Fixture vs schema drift (contract-check BP#3 FAIL)

**Symptom:** BP#3 reports a fixture item `uses field "X" the live schema does
not declare` or `omits "Y" which the live schema now REQUIRES`. **Cause:** the
catalog `catalog-item.schema.json` added/removed/renamed a field; the curated
fixture (`tests/fixtures/catalog/manifest.json`) no longer matches the
contract. **Fix:** edit the fixture to drop the removed field or add the newly
required one (keep it a minimal curated subset). If the new required field is
deliberately omitted, add it to `requiredOmitExempt` in `contract-check.mjs` — a
conscious decoupling decision.

## Coverage ratchet says raise the floor

**Symptom:** `coverage-ratchet.mjs` prints a non-fatal hint
`global <metric>: N% exceeds floor M% by >=1pp — raise floor to N`. **Cause:**
coverage climbed comfortably above the recorded floor; the floor should ratchet
up to lock in the gain. **Fix:** bump the corresponding metric floor in
`.c8rc.json` to the suggested value (never auto-edited; raise by hand only).
Re-run `yarn test:coverage && node scripts/coverage-ratchet.mjs` to confirm PASS.
