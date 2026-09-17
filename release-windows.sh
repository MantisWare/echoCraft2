#!/usr/bin/env bash
#
# Signed Windows release: package, verify, upload. Does not bump the version;
# run ./release-macos.sh first so all three platforms share one build number.
#
# Usage:
#   ./release-windows.sh
#   ./release-windows.sh --dry-run
#
# Run from Git Bash or MSYS2 on Windows.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    echo "error: Windows releases must run on Windows from Git Bash or MSYS2." >&2
    exit 1
    ;;
esac

exec node scripts/release.js win "$@"
