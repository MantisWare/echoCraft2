#!/usr/bin/env bash
#
# Build EchoCraft for macOS and package a DMG into dist/.
#
# The full pipeline runs: native Swift/C helpers are compiled and sidecar
# binaries downloaded (npm's prebuild:mac hook), the renderer is built with
# Vite, then electron-builder packs the app and creates the installer.
#
# Must run on macOS: better-sqlite3 / onnxruntime-node are rebuilt against the
# host toolchain and the Swift helpers need Xcode command line tools.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ARCH=""
TARGETS="dmg"
BUMP=""
PUBLISH="never"
SIGNED="false"
INSTALL="false"
SKIP_PREP="false"

usage() {
  cat <<'EOF'
Usage: ./build-macos.sh [options]

Options:
  --arch <arm64|x64|universal>  Target architecture (default: host architecture)
  --targets "<list>"            electron-builder mac targets (default: "dmg", e.g. "dmg zip")
  --bump <patch|minor|major|X.Y.Z>
                                Bump the version in package.json before building (no git tag)
  --signed                      Sign and notarize with the release identity from
                                electron-builder.json. Requires the "Gizmo Labs Inc."
                                Developer ID cert in the keychain plus notarization
                                credentials (APPLE_API_KEY + APPLE_API_KEY_ID +
                                APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD
                                + APPLE_TEAM_ID). Default is an unsigned local build.
  --publish                     Publish to the GitHub release configured in
                                electron-builder.json (default: never publish)
  --install                     Run "npm ci" before building
  --clean                       Deprecated no-op: dist/ and src/dist/ are always
                                deleted before building
  --skip-prep                   Skip the native compile + sidecar download step
                                (only safe when resources/bin is already populated)
  -h, --help                    Show this help

Examples:
  ./build-macos.sh                          # unsigned DMG for this Mac
  ./build-macos.sh --bump patch             # 1.9.2 -> 1.9.3, then build
  ./build-macos.sh --arch x64               # Intel DMG
  ./build-macos.sh --targets "dmg zip" --signed
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="${2:-}"
      [[ -n "$ARCH" ]] || { echo "error: --arch needs a value" >&2; exit 1; }
      shift 2
      ;;
    --targets)
      TARGETS="${2:-}"
      [[ -n "$TARGETS" ]] || { echo "error: --targets needs a value" >&2; exit 1; }
      shift 2
      ;;
    --bump)
      BUMP="${2:-}"
      [[ -n "$BUMP" ]] || { echo "error: --bump needs a value" >&2; exit 1; }
      shift 2
      ;;
    --signed) SIGNED="true"; shift ;;
    --publish) PUBLISH="always"; shift ;;
    --install) INSTALL="true"; shift ;;
    --clean) shift ;;
    --skip-prep) SKIP_PREP="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: macOS builds must run on macOS (native modules are rebuilt for the host)." >&2
  exit 1
fi

for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: $cmd not found on PATH" >&2; exit 1; }
done

if [[ -z "$ARCH" ]]; then
  case "$(uname -m)" in
    arm64) ARCH="arm64" ;;
    x86_64) ARCH="x64" ;;
    *) echo "error: unsupported host architecture: $(uname -m)" >&2; exit 1 ;;
  esac
fi

case "$ARCH" in
  arm64|x64|universal) ;;
  *) echo "error: --arch must be arm64, x64, or universal" >&2; exit 1 ;;
esac

EXPECTED_NODE="$(cat .nvmrc 2>/dev/null || echo "")"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ -n "$EXPECTED_NODE" && "$NODE_MAJOR" != "$EXPECTED_NODE" ]]; then
  echo "warning: Node $NODE_MAJOR in use, project pins Node $EXPECTED_NODE (.nvmrc)."
  echo "         Use 'nvm use $EXPECTED_NODE' before installing dependencies, or the"
  echo "         lockfile will drift from CI."
fi

# .env ships as an extraResource, so electron-builder fails if the file is absent.
if [[ ! -f .env ]]; then
  echo "note: creating an empty .env (packaged as an extraResource)"
  touch .env
fi

if [[ "$BUMP" != "" ]]; then
  npm version "$BUMP" --no-git-tag-version >/dev/null
fi

VERSION="$(node -p 'require("./package.json").version')"

if [[ "$INSTALL" == "true" ]]; then
  npm ci
fi

# Artifacts from an earlier version or target survive in dist/, so they would be
# picked up by the listing at the end of this script and shipped by --publish.
rm -rf dist src/dist

BUILD_ARGS=()
# shellcheck disable=SC2206 # targets are intentionally word-split into separate args
BUILD_ARGS+=($TARGETS)
BUILD_ARGS+=("--$ARCH" "--publish" "$PUBLISH")

if [[ "$SIGNED" == "true" ]]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=true
else
  BUILD_ARGS+=("--config" "electron-builder.unsigned-mac.json")
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

echo "Building EchoCraft $VERSION for macOS"
echo "  arch:     $ARCH"
echo "  targets:  $TARGETS"
echo "  signing:  $([[ "$SIGNED" == "true" ]] && echo "Developer ID + notarization" || echo "unsigned (local install only)")"
echo "  publish:  $PUBLISH"
echo

if [[ "$SKIP_PREP" == "true" ]]; then
  npm run build:renderer
  npx electron-builder --mac "${BUILD_ARGS[@]}"
else
  npm run build:mac -- "${BUILD_ARGS[@]}"
fi

echo
echo "Artifacts in dist/:"
find dist -maxdepth 1 -type f \( -name "*.dmg" -o -name "*.zip" \) -print 2>/dev/null || true

if [[ "$SIGNED" != "true" ]]; then
  echo
  echo "This DMG is unsigned. Gatekeeper will quarantine it on other Macs; after"
  echo "installing, clear the flag with:"
  echo "  xattr -dr com.apple.quarantine \"/Applications/EchoCraft 2.0.app\""
fi
