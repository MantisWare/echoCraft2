#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "This script will stop EchoCraft, remove the installed app, and delete caches, databases, and preferences."
read -r -p "Continue with the full uninstall? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

remove_target() {
  local target="$1"
  if [[ -e "$target" ]]; then
    echo "Removing $target"
    rm -rf "$target" 2>/dev/null || sudo rm -rf "$target"
  fi
}

echo "Stopping running EchoCraft/Electron processes..."
pkill -f "EchoCraft" 2>/dev/null || true
pkill -f "echocraft" 2>/dev/null || true
pkill -f "Electron Helper.*EchoCraft" 2>/dev/null || true

echo "Removing /Applications/EchoCraft 2.0.app (requires admin)..."
remove_target "/Applications/EchoCraft 2.0.app"

echo "Purging Application Support data..."
remove_target "$HOME/Library/Application Support/EchoCraft 2.0"
remove_target "$HOME/Library/Application Support/EchoCraft-development"
remove_target "$HOME/Library/Application Support/EchoCraft-staging"
remove_target "$HOME/Library/Application Support/com.mantisware.echocraft"

echo "Removing caches, logs, and saved state..."
remove_target "$HOME/Library/Caches/com.mantisware.echocraft"
remove_target "$HOME/Library/Preferences/com.mantisware.echocraft.plist"
remove_target "$HOME/Library/Logs/EchoCraft 2.0"
remove_target "$HOME/Library/Saved Application State/com.mantisware.echocraft.savedState"
remove_target "$HOME/.cache/echocraft"
remove_target "$HOME/.echocraft"

echo "Cleaning temporary files..."
shopt -s nullglob
for tmp in /tmp/echocraft*; do
  remove_target "$tmp"
done
for crash in "$HOME/Library/Application Support/CrashReporter"/EchoCraft_*; do
  remove_target "$crash"
done
shopt -u nullglob

# ~/.cache/openwhispr holds the downloaded models and is deliberately shared
# with a parallel OpenWhispr install, so it is never removed here.
read -r -p "Remove downloaded Whisper models and caches (~/.cache/whisper, ~/Library/Application Support/whisper)? [y/N]: " wipe_models
if [[ "$wipe_models" =~ ^[Yy]$ ]]; then
  remove_target "$HOME/.cache/whisper"
  remove_target "$HOME/Library/Application Support/whisper"
fi

ENV_FILE="$PROJECT_ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  read -r -p "Remove the local environment file at $ENV_FILE? [y/N]: " wipe_env
  if [[ "$wipe_env" =~ ^[Yy]$ ]]; then
    echo "Removing $ENV_FILE"
    rm -f "$ENV_FILE"
  fi
fi

cat <<'EOF'
macOS keeps microphone, screen recording, and accessibility approvals even after files are removed.
Reset them if you want a truly fresh start:
  tccutil reset Microphone com.mantisware.echocraft
  tccutil reset Accessibility com.mantisware.echocraft
  tccutil reset ScreenCapture com.mantisware.echocraft

Full uninstall complete. Reboot if you removed permissions, then reinstall or run npm scripts on a clean tree.
EOF
