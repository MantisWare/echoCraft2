# Publish docs/webpage/ to https://www.mantisware.co.za/echoCraft/.
# Does not build, sign, or upload platform binaries.
# Reads FTP credentials from .env.upload.
#
# Usage:
#   .\upload-web.ps1
#   .\upload-web.ps1 --dry-run

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot

& node scripts/upload-web.js @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
