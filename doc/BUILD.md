# CMToken Plugin — Build & Test Guide

## Quick Reference

```bash
# Build only (generates dist/index.js)
npm run build

# Build + package into cmtoken.tgz
npm run pack

# Start local mock server (for testing)
npm run mock
```

> All commands should be run from `extensions/cmtoken/`.

---

## Full Testing Workflow

### 1. Start the mock server

```powershell
npm run mock
# → Mock CMToken server running at http://localhost:3000
```

### 2. Build & package

Open a **second terminal**:

```powershell
npm run pack
# → ✅ Package → .../cmtoken.tgz (~0.9 MB)
```

### 3. Install & run

```powershell
# Remove any previous installation
rm -r -Force $HOME\.openclaw\extensions\cmtoken

# Install the fresh package
openclaw plugins install .\cmtoken.tgz

# Set the mock server URL and start OpenClaw
$env:CMTOKEN_BASE_URL="http://localhost:3000"
openclaw dev
```

### 4. Verify

- Complete the OAuth flow in your browser (click "Authorize")
- In the model picker, search for `mock-` — you should see mock models
- Check console for `[cmtoken] Successfully fetched N models from mock server`

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
