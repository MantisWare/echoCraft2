# Upload whatever complete platform releases are already in dist/. Does not
# build, bump, or sign. Reads Nextcloud credentials from .env.upload.
# Missing macOS / Windows / Linux sets are skipped.
#
# Usage:
#   .\upload.ps1
#   .\upload.ps1 --dry-run

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot

& node scripts/upload.js @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
