# CMToken & Tuken — Multi-Platform Offline Package Builder (openclaw.install.<platform>.tgz)

This directory contains the tools to package all dependencies needed for an absolute **zero-configuration, offline-first deployment** of OpenClaw with CMToken and Tuken on different target systems.

## What is inside each package?

When you build a target platform archive, it generates an `openclaw.install.<platform>.tgz` containing:
1. **Portable Node.js (v22)**: Loaded statically to act as the runtime on host systems without Node.js.
2. **Portable Git (MinGit for Windows)**: Bundled automatically to manage repositories locally on Windows.
3. **OpenClaw Core Codebase**: Uncompressed source setup, ready for instant dependency installation.
4. **CMToken Provider Plugin**: `cmtoken-v1.0.0-prod.tgz`
5. **Tuken Channel Plugin**: `tuken-v0.6.0.tgz`

## Prerequisites

Before packaging, make sure that both the CMToken provider plugin and the Tuken channel plugin are fully compiled and packed:

```bash
# 1. Build and pack CMToken in workspace root
pnpm run pack --env=prod

# 2. Build and pack Tuken in the channel directory
cd channel
pnpm run pack
```

## How to build the offline packages?

Run the build script under the `shell/packet/` directory.

### Build for current host platform (Auto-detected)

```bash
node shell/packet/build.mjs
```

### Build for specific platform

```bash
# Build for Windows (openclaw.install.win.tgz)
node shell/packet/build.mjs --platform=win

# Build for Linux (openclaw.install.linux.tgz)
node shell/packet/build.mjs --platform=linux

# Build for macOS (openclaw.install.mac.tgz)
node shell/packet/build.mjs --platform=mac
```

### Build all platforms at once

```bash
node shell/packet/build.mjs --all
```

All compiled offline packages, along with all deployment entrypoint scripts (install.sh, install.bat, install.ps1, and README.md), will be gathered and generated inside the `shell/releases/` directory!
