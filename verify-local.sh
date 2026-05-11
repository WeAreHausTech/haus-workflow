#!/usr/bin/env bash
set -euo pipefail

echo "[1/8] install + build"
yarn install
yarn build

echo "[2/8] audits"
yarn catalog:audit
yarn sources:audit

echo "[3/8] tests"
yarn test

echo "[4/8] cli smoke (dist)"
node dist/cli.js --help >/dev/null
node dist/cli.js scan --json >/dev/null
node dist/cli.js recommend --json >/dev/null
node dist/cli.js doctor >/dev/null
node dist/cli.js apply --dry-run >/dev/null
node dist/cli.js explain-context >/dev/null
node dist/cli.js apply --write >/dev/null
node dist/cli.js update --check >/dev/null
node dist/cli.js sources audit >/dev/null

echo "[5/8] global command smoke via npm link"
npm link >/dev/null
haus --help >/dev/null
haus scan >/dev/null
haus recommend >/dev/null
haus doctor >/dev/null
haus apply --dry-run >/dev/null

echo "[6/8] plugin install smoke (temp target)"
TMP_PLUGIN_DIR="$(mktemp -d)"
HAUS_PLUGIN_DIR="$TMP_PLUGIN_DIR" node dist/cli.js plugin install >/dev/null
node dist/cli.js plugin validate >/dev/null
test -f "$TMP_PLUGIN_DIR/.claude-plugin/plugin.json"

echo "[7/8] guided setup noninteractive fast path"
node dist/cli.js setup-project --fast --json >/dev/null

echo "[8/8] generated artifacts check"
test -f .haus-ai/context-map.json
test -f .haus-ai/recommendation.json
test -f .haus-ai/scan-hashes.json

echo "PASS: all local verification checks completed"