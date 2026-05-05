#!/bin/bash
# cmtoken plugin installer/updater (Linux / macOS / Git Bash / WSL)
# Install:  curl -fsSL http://159.75.246.86:19000/install | bash
# Update:   same command
set -e

PLUGIN="cmtoken"
TGZ="cmtoken.tgz"
SERVER="http://159.75.246.86:19000"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "📦 Downloading ${PLUGIN}..."
curl -fsSL "${SERVER}/${TGZ}" -o "${TMPDIR}/${TGZ}"

# Remove old version if exists (auto-confirm with yes)
echo "🔄 Removing old version if exists..."
yes | openclaw plugins uninstall "$PLUGIN" 2>/dev/null || true

echo "🔧 Installing ${PLUGIN}..."
openclaw plugins install "${TMPDIR}/${TGZ}"

echo "✅ ${PLUGIN} plugin installed/updated successfully!"
