# Upload complete platform releases already in dist/, then publish
# docs/webpage/ to https://www.mantisware.co.za/echoCraft/.
# Does not build, bump, or sign. Reads credentials from .env.upload.
# Missing macOS / Windows / Linux sets are skipped. The website still uploads.
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
