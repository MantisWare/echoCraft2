#!/usr/bin/env bash
#
# Linux release: package, verify, upload. Does not bump the version; run
# ./release-macos.sh first so all three platforms share one build number.
#
# Usage:
#   ./release-linux.sh
#   ./release-linux.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: Linux releases must run on Linux." >&2
  exit 1
fi

exec node scripts/release.js linux "$@"
