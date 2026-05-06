# CMToken Plugin — Build & Test Guide

## Quick Reference

```bash
# Build only (generates dist/index.js)
npm run build

# Build + package into cmtoken.tgz
npm run pack
```

> All commands should be run from the root of the `cmtoken` extension.

---

## Testing Workflow

### 1. Build & package

```powershell
npm run pack
# → ✅ Package → .../cmtoken.tgz
```

### 2. Install & run

```powershell
# Remove any previous installation
openclaw plugins uninstall cmtoken

# Install the fresh package
openclaw plugins install .\cmtoken.tgz

# Start OpenClaw for testing
openclaw dev
```

---

## Environment Variables (Runtime)

| Variable              | Purpose                                  | Example                    |
|-----------------------|------------------------------------------|----------------------------|
| `CMTOKEN_BASE_URL`    | Override OAuth + API base URL            | `http://localhost:3000`    |
| `CMTOKEN_API_HOST`    | Override catalog/model discovery URL     | `http://localhost:3000`    |
| `SSH_CLIENT`          | Fake remote env to force QR code display | `127.0.0.1 1 1`           |

---

## Build Internals

The build script (`scripts/build.mjs`) does the following:

1. **Bundle** — Runs `esbuild` with `--bundle --platform=node --format=esm`
2. **Alias** — Maps `openclaw/plugin-sdk` → repo's `src/plugin-sdk/` (fully self-contained)
3. **Stage** — Copies `dist/index.js`, `package.json`, `openclaw.plugin.json` into a staging dir
4. **Archive** — Creates `cmtoken.tgz` from the staging dir

The resulting `.tgz` is 100% portable — no host-side SDK exports needed.
