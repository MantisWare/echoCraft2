#!/usr/bin/env bash
#
# Signed, notarized macOS release: bump the version, package, verify, upload.
# This is the only platform that changes package.json — Windows and Linux
# reuse whatever version this command last wrote.
#
# Usage:
#   ./release-macos.sh
#   ./release-macos.sh --no-bump
#   ./release-macos.sh --bump minor
#   ./release-macos.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: macOS releases must run on macOS." >&2
  exit 1
fi

exec node scripts/release.js mac "$@"
