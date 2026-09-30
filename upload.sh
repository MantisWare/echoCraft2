#!/usr/bin/env bash
#
# Upload complete platform releases already in dist/, then publish
# docs/webpage/ to https://www.mantisware.co.za/echoCraft/.
# Does not build, bump, or sign. Reads credentials from .env.upload.
# Missing macOS / Windows / Linux sets are skipped. The website still uploads.
#
# Usage:
#   ./upload.sh
#   ./upload.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec node scripts/upload.js "$@"
