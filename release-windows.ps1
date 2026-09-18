# Signed Windows release: package, verify, upload. Does not bump the version;
# run ./release-macos.sh first so all three platforms share one build number.
#
# Usage:
#   .\release-windows.ps1
#   .\release-windows.ps1 --dry-run
#
# Run from PowerShell on Windows.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot

if ($env:OS -ne 'Windows_NT') {
  [Console]::Error.WriteLine('error: Windows releases must run on Windows from PowerShell.')
  exit 1
}

& node scripts/release.js win @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
