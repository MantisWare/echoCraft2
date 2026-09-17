# Releasing EchoCraft

Production releases are built on the native OS for each platform, signed locally, then uploaded to the Nextcloud generic update feed. Ordinary `build:*` commands never publish. Only `release:*` may change what installed clients download.

## Compatibility

Installed v1 clients discover updates from:

`https://storage.mantisware.co.za/public.php/dav/files/T9p24tDSSKr5jG7/app/`

Keep these stable:

- App ID: `com.mantisware.echocraft`
- Product / executable name: `EchoCraft`
- Package / updater identity: `echo-craft`
- Channel: `latest`
- macOS signing identity: `Developer ID Application: Waldo Marais (Z2BVWT9X93)`

Supported release targets: macOS arm64, Windows x64, Linux x64. Intel macOS and the retired `https://mantisware.co.za/echoCraft/App/` feed are out of scope.

## Prerequisites

| Platform | Host | Notes |
| -------- | ---- | ----- |
| macOS | Apple Silicon Mac | Xcode command line tools, Developer ID Application cert in the keychain or `CSC_LINK` |
| Windows | x64 Windows | `CSC_LINK` / `CSC_KEY_PASSWORD` for an Authenticode certificate whose publisher includes `MANTISWARE` |
| Linux | x64 Linux | No package signature; AppImage/deb/rpm/tar.gz are uploaded after local packaging |

Use Node 24 (see `.nvmrc`). Do not regenerate `package-lock.json` with another major version.

## Version preparation

Only macOS bumps the version. `./release-macos.sh` defaults to a patch bump, then Windows and Linux reuse that number so all three installers share one build.

```bash
./release-macos.sh                 # 2.0.5 -> 2.0.6, then sign, notarize, upload
./release-macos.sh --bump minor    # 2.0.5 -> 2.1.0
./release-macos.sh --no-bump       # rebuild and republish the current version
./release-windows.sh               # does not bump
./release-linux.sh                 # does not bump
```

Roll out macOS arm64 first, then Windows x64, then Linux x64. Passing `--bump` on Windows or Linux is an error.

## Secrets

Copy [`.env.release.example`](../.env.release.example) to `.env.release` (gitignored). You can also use `.env.signing` and `.env.upload`. Process environment variables win over files.

Required:

- Every platform: `NC_PASSWORD` (and optionally `NC_URL`, `NC_USER`, `REMOTE_FOLDER`)
- Windows: `CSC_LINK` and `CSC_KEY_PASSWORD` (or `WIN_CSC_*`)
- macOS: Developer ID Application `Waldo Marais (Z2BVWT9X93)` in the login keychain, plus notarization via `APPLE_API_KEY_ID` + `APPLE_API_KEY` + `APPLE_API_ISSUER`, or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`; `APPLE_TEAM_ID` defaults to `Z2BVWT9X93`. `CSC_LINK` is ignored on macOS (electron-builder 26.15.3 unlocks its temp keychain with the wrong password).

A Nextcloud password that ever lived in v1 git history must be treated as compromised. Use a rotated password in the gitignored local file. Never commit `.env.signing`, `.env.upload`, or `.env.release`.

## Commands

```bash
./release-macos.sh       # Apple Silicon Mac (bumps patch by default)
./release-windows.sh     # Windows x64 (Git Bash / MSYS2)
./release-linux.sh       # Linux x64
./upload.sh              # upload whatever complete platforms are already in dist/

./release-macos.sh --dry-run --skip-build
./upload.sh --dry-run
```

`npm run release:mac`, `release:win`, and `release:linux` are aliases for the same Node runner. `--dry-run` and `--skip-build` never bump the version. `--dry-run` prints upload order without writing to Nextcloud. `--skip-build` reuses `dist/` after a previous signed build.

`./upload.sh` does not build or sign. It reads Nextcloud credentials from `.env.upload` (`NC_URL`, `NC_USER`, `NC_PASSWORD`, `REMOTE_FOLDER`), scans `dist/` for macOS, Windows, and Linux artifacts, uploads each complete set (manifest last), and reports platforms that are missing. Signing credentials are not required.

Each command fails closed when credentials, host/arch, signatures, notarization, manifest references, checksums, or uploads are wrong. Artifacts and blockmaps are uploaded first; that platform's `latest*.yml` is uploaded last.

## Expected artifacts

Written to `dist/` and uploaded only for the platform being released:

| Platform | Manifest | Binaries |
| -------- | -------- | -------- |
| macOS arm64 | `latest-mac.yml` | `EchoCraft-darwin-arm64.dmg`, `EchoCraft-darwin-arm64.zip`, `.blockmap` |
| Windows x64 | `latest.yml` | `EchoCraft-win32-x64.exe`, optional `EchoCraft-win32-x64-portable.exe`, `.blockmap` |
| Linux x64 | `latest-linux.yml` | `EchoCraft-linux-x64.AppImage`, `.deb`, `.rpm`, `.tar.gz` |

Public share: https://storage.mantisware.co.za/s/T9p24tDSSKr5jG7

## Verify a signed macOS build

```bash
codesign --verify --deep --strict "dist/mac-arm64/EchoCraft.app"
codesign -dv --verbose=4 "dist/mac-arm64/EchoCraft.app"
xcrun stapler validate "dist/mac-arm64/EchoCraft.app"
spctl -a -vv "dist/mac-arm64/EchoCraft.app"
```

Expect Team ID `Z2BVWT9X93` and `source=Notarized Developer ID`.

## Rollback

Nextcloud overwrites files in place. To roll back a platform, restore that platform's previous installer(s), blockmap(s), and `latest*.yml` as a set. Do not restore a manifest whose `url` entries are missing. Other platforms' manifests can stay as they are.

## GitHub Actions

CI may still compile unsigned or non-publishing packages for tests. It does not upload to Nextcloud or GitHub Releases. The supported production path is the local `release:*` commands above.
