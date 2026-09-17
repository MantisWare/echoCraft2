#!/usr/bin/env bash
#
# Upload whatever complete platform releases are already in dist/. Does not
# build, bump, or sign. Reads Nextcloud credentials from .env.upload.
# Missing macOS / Windows / Linux sets are skipped.
#
# Usage:
#   ./upload.sh
#   ./upload.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec node scripts/upload.js "$@"
