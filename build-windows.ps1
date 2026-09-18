# Build EchoCraft for Windows and package installers into dist/.
#
# The full pipeline runs: native helpers are compiled where a compiler is
# available and the prebuilt sidecar binaries are downloaded (npm's prebuild:win
# hook), the renderer is built with Vite, then electron-builder packs the app
# and creates the installers.
#
# Run this from PowerShell on Windows: better-sqlite3 / onnxruntime-node are
# rebuilt against the host toolchain, so WSL, macOS, or Linux hosts would
# produce binaries the packaged app cannot load.
#
# The key/mic/paste helpers are downloaded prebuilt, so MSVC is optional; with
# Visual Studio Build Tools installed they are compiled from resources/*.c
# instead.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot

function Write-ErrorLine {
  param([Parameter(Mandatory)][string]$Message)
  [Console]::Error.WriteLine($Message)
}

function Show-Usage {
  param([switch]$AsError)
  $text = @'
Usage: .\build-windows.ps1 [options]

Options:
  --arch <x64|arm64>            Target architecture (default: host architecture)
  --targets "<list>"            electron-builder win targets
                                (default: "nsis"; also "portable")
  --signed                      Sign with CSC_LINK + CSC_KEY_PASSWORD (or WIN_CSC_*).
                                Default is an unsigned local build.
  --publish                     Generate updater metadata for the generic Nextcloud
                                feed. Does not upload; use .\release-windows.ps1.
  --install                     Run "npm ci" before building
  --clean                       Deprecated no-op: dist/ and src/dist/ are always
                                deleted before building
  --skip-prep                   Skip the native compile + sidecar download step
                                (only safe when resources/bin is already populated)
  -h, --help                    Show this help

Examples:
  .\build-windows.ps1                          # unsigned NSIS installer
  .\build-windows.ps1 --targets "nsis portable"

The version is not bumped here. Cut a new version with ./release-macos.sh
(or a local DMG with ./build-macos.sh) so all three platforms share one number.
'@
  if ($AsError) {
    [Console]::Error.WriteLine($text)
  } else {
    Write-Output $text
  }
}

function Resolve-WindowsCmd {
  param([Parameter(Mandatory)][string]$Name)
  $cmd = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  return $null
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$NativeArgs = @()
  )
  & $FilePath @NativeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Invoke-NodePrint {
  param([Parameter(Mandatory)][string]$Expression)
  # Windows PowerShell strips quotes inside native argv, so callers must not
  # pass JS that contains quoted strings (split("."), require("./file"), …).
  $output = & $script:NodePath -p $Expression
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  return ([string]$output).Trim()
}

$Arch = ''
$Targets = 'nsis'
$Publish = 'never'
$Signed = $false
$Install = $false
$SkipPrep = $false

$scriptArgs = @($args)
$i = 0
while ($i -lt $scriptArgs.Count) {
  $current = [string]$scriptArgs[$i]
  switch ($current) {
    '--arch' {
      if (($i + 1) -ge $scriptArgs.Count -or [string]::IsNullOrEmpty([string]$scriptArgs[$i + 1])) {
        Write-ErrorLine 'error: --arch needs a value'
        exit 1
      }
      $Arch = [string]$scriptArgs[$i + 1]
      $i += 2
      break
    }
    '--targets' {
      if (($i + 1) -ge $scriptArgs.Count -or [string]::IsNullOrEmpty([string]$scriptArgs[$i + 1])) {
        Write-ErrorLine 'error: --targets needs a value'
        exit 1
      }
      $Targets = [string]$scriptArgs[$i + 1]
      $i += 2
      break
    }
    '--signed' {
      $Signed = $true
      $i += 1
      break
    }
    '--publish' {
      $Publish = 'always'
      $i += 1
      break
    }
    '--install' {
      $Install = $true
      $i += 1
      break
    }
    '--clean' {
      $i += 1
      break
    }
    '--skip-prep' {
      $SkipPrep = $true
      $i += 1
      break
    }
    { $_ -in @('-h', '--help') } {
      Show-Usage
      exit 0
    }
    default {
      Write-ErrorLine "error: unknown option: $current"
      Show-Usage -AsError
      exit 1
    }
  }
}

if ($env:OS -ne 'Windows_NT') {
  Write-ErrorLine 'error: Windows builds must run on Windows from PowerShell.'
  Write-ErrorLine '       Native modules are rebuilt for the host, so WSL/macOS/Linux hosts'
  Write-ErrorLine '       produce a package that cannot load better-sqlite3 or onnxruntime.'
  exit 1
}

$script:NodePath = Resolve-WindowsCmd 'node'
$npmPath = Resolve-WindowsCmd 'npm'
if (-not $script:NodePath) {
  Write-ErrorLine 'error: node not found on PATH'
  exit 1
}
if (-not $npmPath) {
  Write-ErrorLine 'error: npm not found on PATH'
  exit 1
}

if ([string]::IsNullOrEmpty($Arch)) {
  $hostArch = Invoke-NodePrint 'process.arch'
  switch ($hostArch) {
    'x64' { $Arch = 'x64' }
    'arm64' { $Arch = 'arm64' }
    default {
      Write-ErrorLine "error: unsupported host architecture: $hostArch"
      exit 1
    }
  }
}

if ($Arch -notin @('x64', 'arm64')) {
  Write-ErrorLine 'error: --arch must be x64 or arm64'
  exit 1
}

if ($Signed) {
  foreach ($var in @('AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET')) {
    if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($var))) {
      Write-ErrorLine "error: --signed requires $var to be set"
      exit 1
    }
  }
}

$expectedNode = ''
if (Test-Path -LiteralPath '.nvmrc') {
  $expectedNode = (Get-Content -LiteralPath '.nvmrc' -TotalCount 1).Trim()
}
$nodeVersion = Invoke-NodePrint 'process.versions.node'
$nodeMajor = ($nodeVersion -split '\.')[0]
if ($expectedNode -and $nodeMajor -ne $expectedNode) {
  Write-Output "warning: Node $nodeMajor in use, project pins Node $expectedNode (.nvmrc)."
  Write-Output "         Use Node $expectedNode before installing dependencies, or the"
  Write-Output '         lockfile will drift from CI.'
}

# .env ships as an extraResource, so electron-builder fails if the file is absent.
if (-not (Test-Path -LiteralPath '.env')) {
  Write-Output 'note: creating an empty .env (packaged as an extraResource)'
  New-Item -ItemType File -Path '.env' | Out-Null
}

# Packages whatever version macOS last built, so one release carries one
# version across all three platforms.
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version

if ($Install) {
  Invoke-Native -FilePath $npmPath -NativeArgs @('ci')
}

# Artifacts from an earlier version or target survive in dist/, so they would be
# picked up by the listing at the end of this script and shipped by --publish.
foreach ($dir in @('dist', 'src/dist')) {
  if (Test-Path -LiteralPath $dir) {
    Remove-Item -LiteralPath $dir -Recurse -Force
  }
}

$buildArgs = @()
$buildArgs += ($Targets -split '\s+' | Where-Object { $_ })
$buildArgs += "--$Arch"
$buildArgs += '--publish'
$buildArgs += $Publish
if (-not $Signed) {
  $buildArgs += '--config'
  $buildArgs += 'electron-builder.unsigned-win.json'
}

$signingLabel = if ($Signed) { 'Azure Trusted Signing' } else { 'unsigned (SmartScreen will warn)' }

Write-Output "Building EchoCraft $version for Windows"
Write-Output "  arch:     $Arch"
Write-Output "  targets:  $Targets"
Write-Output "  signing:  $signingLabel"
Write-Output "  publish:  $Publish"
Write-Output ''

if ($SkipPrep) {
  Invoke-Native -FilePath $npmPath -NativeArgs @('run', 'build:renderer')
  $npxPath = Resolve-WindowsCmd 'npx'
  if (-not $npxPath) {
    Write-ErrorLine 'error: npx not found on PATH'
    exit 1
  }
  Invoke-Native -FilePath $npxPath -NativeArgs (@('electron-builder', '--win') + $buildArgs)
} else {
  Invoke-Native -FilePath $npmPath -NativeArgs (@('run', 'build:win', '--') + $buildArgs)
}

Write-Output ''
Write-Output 'Artifacts in dist/:'
if (Test-Path -LiteralPath 'dist') {
  Get-ChildItem -LiteralPath 'dist' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @('.exe', '.msi') } |
    ForEach-Object { Write-Output ('dist/' + $_.Name) }
}
