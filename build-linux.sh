#!/usr/bin/env bash
#
# Build EchoCraft for Linux and package installers into dist/.
#
# The full pipeline runs: native helpers are compiled and sidecar binaries
# downloaded (npm's prebuild:linux hook), the renderer is built with Vite, then
# electron-builder packs the app and creates the installers.
#
# Must run on Linux: better-sqlite3 / onnxruntime-node are rebuilt against the
# host toolchain and the PipeWire system-audio helper links against local dev
# headers.
#
# Build dependencies (Debian/Ubuntu):
#   sudo apt-get install -y rpm libx11-dev libxtst-dev libatspi2.0-dev \
#     libglib2.0-dev libpipewire-0.3-dev pkg-config
# ("rpm" is only needed for the rpm target.)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ARCH=""
TARGETS="AppImage deb"
PUBLISH="never"
INSTALL="false"
SKIP_PREP="false"

usage() {
  cat <<'EOF'
Usage: ./build-linux.sh [options]

Options:
  --arch <x64|arm64>            Target architecture (default: host architecture)
  --targets "<list>"            electron-builder linux targets
                                (default: "AppImage deb"; also "rpm", "tar.gz")
  --publish                     Generate updater metadata for the generic Nextcloud
                                feed. Does not upload; use ./release-linux.sh.
  --install                     Run "npm ci" before building
  --clean                       Deprecated no-op: dist/ and src/dist/ are always
                                deleted before building
  --skip-prep                   Skip the native compile + sidecar download step
                                (only safe when resources/bin is already populated)
  -h, --help                    Show this help

Examples:
  ./build-linux.sh                                   # AppImage + deb for this machine
  ./build-linux.sh --targets "AppImage deb rpm tar.gz"

The version is not bumped here. Cut a new version with ./release-macos.sh
(or a local DMG with ./build-macos.sh) so all three platforms share one number.
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
    --publish) PUBLISH="always"; shift ;;
    --install) INSTALL="true"; shift ;;
    --clean) shift ;;
    --skip-prep) SKIP_PREP="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: Linux builds must run on Linux (native modules are rebuilt for the host)." >&2
  exit 1
fi

for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: $cmd not found on PATH" >&2; exit 1; }
done

if [[ -z "$ARCH" ]]; then
  case "$(uname -m)" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "error: unsupported host architecture: $(uname -m)" >&2; exit 1 ;;
  esac
fi

case "$ARCH" in
  x64|arm64) ;;
  *) echo "error: --arch must be x64 or arm64" >&2; exit 1 ;;
esac

if [[ "$TARGETS" == *rpm* ]] && ! command -v rpmbuild >/dev/null 2>&1; then
  echo "warning: rpmbuild not found; the rpm target will fail. Install the 'rpm' package."
fi

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

echo "Building EchoCraft $VERSION for Linux"
echo "  arch:     $ARCH"
echo "  targets:  $TARGETS"
echo "  publish:  $PUBLISH"
echo

if [[ "$SKIP_PREP" == "true" ]]; then
  npm run build:renderer
  npx electron-builder --linux "${BUILD_ARGS[@]}"
else
  npm run build:linux -- "${BUILD_ARGS[@]}"
fi

echo
echo "Artifacts in dist/:"
find dist -maxdepth 1 -type f \
  \( -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.tar.gz" \) -print 2>/dev/null || true
