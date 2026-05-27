#!/usr/bin/env bash
# scripts/release.sh — create an annotated git tag to trigger release.yml
#
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.1.0
#
# What it does:
#   1. Validates version argument (x.y.z)
#   2. Checks working tree is clean and branch is main
#   3. Confirms package.json version matches <version> (update it manually if not)
#   4. Runs yarn verify (typecheck + lint + build + test)
#   5. Runs npm pack --dry-run (tarball content check)
#   6. Creates annotated tag v<version>
#   7. Pushes tag to origin (triggers release.yml → npm publish)

set -euo pipefail

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.1.0"
  exit 1
fi

# Validate semver-ish: x.y.z
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be x.y.z (got '$VERSION')"
  exit 1
fi

TAG="v${VERSION}"

# Must be on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main (currently on '$BRANCH')"
  exit 1
fi

# Working tree must be clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes"
  exit 1
fi

# Tag must not already exist
if git tag --list "$TAG" | grep -q "$TAG"; then
  echo "Error: tag $TAG already exists"
  exit 1
fi

# Confirm package.json version matches
PKG_VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
if [[ "$PKG_VERSION" != "$VERSION" ]]; then
  echo "Error: package.json version is '$PKG_VERSION', expected '$VERSION'"
  echo "Update package.json version to $VERSION before releasing."
  exit 1
fi

echo "==> Running yarn verify..."
yarn verify

echo ""
echo "==> Running npm pack --dry-run..."
npm pack --dry-run

echo ""
echo "==> Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"

echo "==> Pushing tag to origin..."
git push origin "$TAG"

echo ""
echo "Release $TAG tagged and pushed. Monitor release.yml for publish status."
