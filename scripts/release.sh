#!/usr/bin/env bash
# scripts/release.sh — non-interactive release for CI / scripted use
#
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0
#
# For interactive releases (recommended for humans) use: yarn release
# For dry runs use: yarn release:dry
#
# This script passes <version> to release-it with --ci (no prompts).
# release-it will: bump package.json, update CHANGELOG.md, commit, tag, push,
# and create a GitHub release. npm publish is handled by release.yml on tag push.

set -euo pipefail

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo ""
  echo "For interactive use: yarn release"
  echo "For dry run:         yarn release:dry"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be x.y.z (got '$VERSION')"
  exit 1
fi

yarn release-it "$VERSION" --ci
