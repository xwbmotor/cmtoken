#!/usr/bin/env bash
# cmtoken plugin installer/updater for OpenClaw
# Unified script: works on Linux, macOS, Windows (Git Bash/WSL)
# New install and update use the same script
#
# Usage:
#   curl -fsSL http://YOUR_SERVER:19000/install.sh | bash
#   Or on Windows PowerShell:
#   iwr http://YOUR_SERVER:19000/install.sh | bash

set -euo pipefail

SERVER="http://159.75.246.86:19000"
PKG_NAME="cmtoken.tgz"
PLUGIN_NAME="cmtoken"

# Colors (fallback if not supported)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- Detect OS ---
detect_os() {
    case "$(uname -s)" in
        Linux*)   echo "linux" ;;
        Darwin*)  echo "macos" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)        echo "unknown" ;;
    esac
}

# --- Find openclaw ---
find_openclaw() {
    if command -v openclaw &>/dev/null; then
        echo "openclaw"
    elif [ -f "$HOME/.local/bin/openclaw" ]; then
        echo "$HOME/.local/bin/openclaw"
    elif [ -f "/usr/local/bin/openclaw" ]; then
        echo "/usr/local/bin/openclaw"
    else
        echo ""
    fi
}

# --- Main ---
main() {
    local os
    os=$(detect_os)
    info "Detected OS: $os"

    # Find openclaw
    local oc
    oc=$(find_openclaw)
    if [ -z "$oc" ]; then
        error "openclaw not found. Please install OpenClaw first."
    fi
    info "Found openclaw: $oc"

    # Create temp directory
    local tmpdir
    tmpdir=$(mktemp -d)
    trap 'rm -rf "$tmpdir"' EXIT

    # Download latest package
    info "Downloading latest ${PKG_NAME}..."
    curl -fsSL "${SERVER}/${PKG_NAME}" -o "${tmpdir}/${PKG_NAME}" || \
        error "Failed to download ${PKG_NAME} from ${SERVER}"

    # Check if plugin is already installed
    local action="install"
    if "$oc" plugins list 2>/dev/null | grep -q "$PLUGIN_NAME"; then
        action="update"
        info "Plugin '${PLUGIN_NAME}' is already installed. Updating..."
        "$oc" plugins uninstall "$PLUGIN_NAME" 2>/dev/null || warn "Uninstall old version failed, continuing..."
    else
        info "Installing plugin '${PLUGIN_NAME}' for the first time..."
    fi

    # Install
    "$oc" plugins install "${tmpdir}/${PKG_NAME}" || \
        error "Failed to install ${PKG_NAME}"

    # Verify
    if "$oc" plugins list 2>/dev/null | grep -q "$PLUGIN_NAME"; then
        info "✅ Plugin '${PLUGIN_NAME}' ${action}ed successfully!"
    else
        warn "Installation completed but plugin not found in list. Please verify manually."
    fi
}

main "$@"
