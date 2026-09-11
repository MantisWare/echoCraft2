#!/usr/bin/env bash
#
# Build EchoCraft for Windows and package installers into dist/.
#
# The full pipeline runs: native helpers are compiled where a compiler is
# available and the prebuilt sidecar binaries are downloaded (npm's prebuild:win
# hook), the renderer is built with Vite, then electron-builder packs the app
# and creates the installers.
#
# Run this from Git Bash (or MSYS2) on Windows: better-sqlite3 /
# onnxruntime-node are rebuilt against the host toolchain, so a WSL or macOS
# host would produce binaries the packaged app cannot load.
#
# The key/mic/paste helpers are downloaded prebuilt, so MSVC is optional; with
# Visual Studio Build Tools installed they are compiled from resources/*.c
# instead.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ARCH=""
TARGETS="nsis"
PUBLISH="never"
SIGNED="false"
INSTALL="false"
SKIP_PREP="false"

usage() {
  cat <<'EOF'
Usage: ./build-windows.sh [options]

Options:
  --arch <x64|arm64>            Target architecture (default: host architecture)
  --targets "<list>"            electron-builder win targets
                                (default: "nsis"; also "portable")
  --signed                      Sign with Azure Trusted Signing from electron-builder.json.
                                Requires AZURE_TENANT_ID, AZURE_CLIENT_ID and
                                AZURE_CLIENT_SECRET. Default is an unsigned local build.
  --publish                     Publish to the GitHub release configured in
                                electron-builder.json (default: never publish)
  --install                     Run "npm ci" before building
  --clean                       Deprecated no-op: dist/ and src/dist/ are always
                                deleted before building
  --skip-prep                   Skip the native compile + sidecar download step
                                (only safe when resources/bin is already populated)
  -h, --help                    Show this help

Examples:
  ./build-windows.sh                          # unsigned NSIS installer
  ./build-windows.sh --targets "nsis portable"

The version is not bumped here. Only ./build-macos.sh bumps it, so all three
platforms ship the same build number; run that first to cut a new version.
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
    --signed) SIGNED="true"; shift ;;
    --publish) PUBLISH="always"; shift ;;
    --install) INSTALL="true"; shift ;;
    --clean) shift ;;
    --skip-prep) SKIP_PREP="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    echo "error: Windows builds must run on Windows from Git Bash or MSYS2." >&2
    echo "       Native modules are rebuilt for the host, so WSL/macOS/Linux hosts" >&2
    echo "       produce a package that cannot load better-sqlite3 or onnxruntime." >&2
    exit 1
    ;;
esac

for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: $cmd not found on PATH" >&2; exit 1; }
done

if [[ -z "$ARCH" ]]; then
  case "$(node -p 'process.arch')" in
    x64) ARCH="x64" ;;
    arm64) ARCH="arm64" ;;
    *) echo "error: unsupported host architecture: $(node -p 'process.arch')" >&2; exit 1 ;;
  esac
fi

case "$ARCH" in
  x64|arm64) ;;
  *) echo "error: --arch must be x64 or arm64" >&2; exit 1 ;;
esac

if [[ "$SIGNED" == "true" ]]; then
  for var in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET; do
    if [[ -z "${!var:-}" ]]; then
      echo "error: --signed requires $var to be set" >&2
      exit 1
    fi
  done
fi

EXPECTED_NODE="$(cat .nvmrc 2>/dev/null || echo "")"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ -n "$EXPECTED_NODE" && "$NODE_MAJOR" != "$EXPECTED_NODE" ]]; then
  echo "warning: Node $NODE_MAJOR in use, project pins Node $EXPECTED_NODE (.nvmrc)."
  echo "         Use Node $EXPECTED_NODE before installing dependencies, or the"
  echo "         lockfile will drift from CI."
fi

# .env ships as an extraResource, so electron-builder fails if the file is absent.
if [[ ! -f .env ]]; then
  echo "note: creating an empty .env (packaged as an extraResource)"
  touch .env
fi

# Packages whatever version macOS last built, so one release carries one
# version across all three platforms.
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

if [[ "$SIGNED" != "true" ]]; then
  BUILD_ARGS+=("--config" "electron-builder.unsigned-win.json")
fi

echo "Building EchoCraft $VERSION for Windows"
echo "  arch:     $ARCH"
echo "  targets:  $TARGETS"
echo "  signing:  $([[ "$SIGNED" == "true" ]] && echo "Azure Trusted Signing" || echo "unsigned (SmartScreen will warn)")"
echo "  publish:  $PUBLISH"
echo

if [[ "$SKIP_PREP" == "true" ]]; then
  npm run build:renderer
  npx electron-builder --win "${BUILD_ARGS[@]}"
else
  npm run build:win -- "${BUILD_ARGS[@]}"
fi

echo
echo "Artifacts in dist/:"
find dist -maxdepth 1 -type f \( -name "*.exe" -o -name "*.msi" \) -print 2>/dev/null || true
