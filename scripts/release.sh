#!/usr/bin/env bash
# scripts/release.sh — non-interactive release for scripted / automated use
#
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0
#
# For interactive releases (recommended for humans) use: yarn release
# For dry runs use: yarn release:dry
#
# Delegates entirely to `yarn release` (release-it) with --ci to suppress
# prompts. release-it handles: version bump, CHANGELOG.md generation from
# conventional commits, git commit + annotated tag, push, GitHub release
# creation, and npm publish using the developer's local npm credentials.

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

yarn release "$VERSION" --ci
