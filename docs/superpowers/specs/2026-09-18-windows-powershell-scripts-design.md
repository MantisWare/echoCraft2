# Windows PowerShell Build/Release/Upload Scripts Design

**Date:** 2026-09-18

**Status:** Approved for implementation

## Goal

Let Windows builds, signed releases, and `dist/` uploads run from PowerShell without Git Bash or MSYS2, with no change to versioning, signing, or upload behavior.

## Binding requirements

1. Replace `build-windows.sh` with `build-windows.ps1` and `release-windows.sh` with `release-windows.ps1`.
2. Add `upload.ps1` as the Windows-friendly twin of `upload.sh`. Keep `upload.sh` for macOS/Linux.
3. Delete the Windows-only bash wrappers. Do not keep dual bash/PowerShell copies of build or release.
4. Target Windows PowerShell 5.1 and PowerShell 7.
5. Keep the same GNU-style flags (`--arch`, `--targets`, `--signed`, `--publish`, `--install`, `--skip-prep`, `--dry-run`, `-h` / `--help`).
6. Refuse to build or release off Windows. Native modules (`better-sqlite3`, `onnxruntime-node`) are rebuilt for the host.
7. Fail native `node` / `npm` / `npx` commands on non-zero `$LASTEXITCODE`. Prefer `npm.cmd` / `npx.cmd` over the PowerShell shims.
8. Leave `scripts/release.js` and `scripts/upload.js` as the real implementations. The `.ps1` files are wrappers plus the Windows build orchestration already in `build-windows.sh`.
9. Update `README.md` and `docs/RELEASING.md` to the PowerShell commands. Do not change signing, bump, or feed rules.

## Architecture

- `build-windows.ps1` is a faithful port of `build-windows.sh`: parse flags, check host/arch/Node, ensure `.env`, optionally `npm ci`, wipe `dist/` and `src/dist/`, then `npm run build:win` (or renderer + `electron-builder` when `--skip-prep`).
- `release-windows.ps1` changes directory to the repo root, requires Windows, and runs `node scripts/release.js win` with remaining args.
- `upload.ps1` changes directory to the repo root and runs `node scripts/upload.js` with remaining args. No host check; same as `upload.sh`.

## Scope boundaries

- Do not port macOS or Linux scripts.
- Do not change electron-builder configs, Azure/CSC signing, or Nextcloud upload logic.
- Do not bump the version from the Windows build or release wrappers.
