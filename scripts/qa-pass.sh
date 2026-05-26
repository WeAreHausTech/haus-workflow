#!/usr/bin/env bash
# Helper: run scan + recommend + explain-context + context --task across a fixture.
# Usage: scripts/qa-pass.sh <fixture-name> "<task>"
set -euo pipefail

FIXTURE="${1:?fixture name required}"
TASK="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FIXTURE_DIR="$ROOT/tests/fixtures/repos/$FIXTURE"

if [[ ! -d "$FIXTURE_DIR" ]]; then
  echo "fixture not found: $FIXTURE_DIR" >&2
  exit 1
fi

TMP="$(mktemp -d)"
cp -R "$FIXTURE_DIR/." "$TMP/"
pushd "$TMP" >/dev/null

node "$CLI" scan --json >/dev/null
node "$CLI" recommend --json >/dev/null

echo "=== $FIXTURE: scan ==="
node -e "const c=JSON.parse(require('fs').readFileSync('.haus-workflow/context-map.json','utf8'));console.log(JSON.stringify({roles:c.repoRoles,stacks:c.detectedStacks},null,2))"

echo "=== $FIXTURE: recommend ==="
node -e "const r=JSON.parse(require('fs').readFileSync('.haus-workflow/recommendation.json','utf8'));console.log(JSON.stringify({selected:r.recommended.map(x=>({id:x.id,c:x.confidenceLevel,reasons:x.reasons.map(y=>y.code)})),skipped:r.skipped.map(x=>x.id)},null,2))"

if [[ -n "$TASK" ]]; then
  echo "=== $FIXTURE: context --task \"$TASK\" ==="
  node "$CLI" context --task "$TASK" --json
fi

popd >/dev/null
rm -rf "$TMP"
