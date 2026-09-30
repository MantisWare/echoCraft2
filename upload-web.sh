#!/usr/bin/env bash
#
# Publish docs/webpage/ to https://www.mantisware.co.za/echoCraft/.
# Does not build, sign, or upload platform binaries.
# Reads FTP credentials from .env.upload.
#
# Usage:
#   ./upload-web.sh
#   ./upload-web.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec node scripts/upload-web.js "$@"
