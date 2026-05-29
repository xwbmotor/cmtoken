# CMToken Plugin

This is a model provider plugin for OpenClaw that supports CMToken authentication (OAuth via phone number) and model inference.

## Features

- **Decoupled**: Independent of the OpenClaw monorepo source code.

## Prerequisites

- **Node.js**: Version 22 or higher.
- **npm** or **pnpm**: For dependency management.

## Installation

1.  **Extract**: Copy this folder to your desired location.
2.  **Dependencies**:
    ```bash
    pnpm install
    ```

## Environment Configuration

All API and OAuth endpoints are managed in `environments.json`. Since this file contains potentially sensitive URLs, it is ignored by Git.

To get started, copy the example file:
```bash
cp environments.json.example environments.json
```
Then, modify `environments.json` to customize the built-in addresses:

```json
{
  "test": {
    "BASE_URL": "...",      // Inference API base
    "DISCOVERY_URL": "...", // Model discovery endpoint
    "OAUTH_URL": "...",     // OAuth server base
    "CLIENT_ID": "..."      // OAuth client ID
  },
  "prod": { ... }
}
```

---

## Build & Package

### 🧪 Test Environment (Default)
Used for local development and testing.

```bash
# Build only
pnpm run build

# Build & Package (generates cmtoken.tgz)
pnpm run pack
```

### 🚀 Production Environment
Used for final distribution with official endpoints.

```bash
# Build only
node scripts/build.mjs --env=prod

# Build & Package (generates cmtoken.tgz)
node scripts/build.mjs --env=prod --pack
```


## Usage in OpenClaw

Install the generated `.tgz` package directly:

```bash
openclaw plugins install ./cmtoken.tgz
```

If you already have an older version installed, you can update it by running the same install command, or by uninstalling it first:

```bash
# To uninstall first (optional)
openclaw plugins uninstall cmtoken

# Then install the new version
openclaw plugins install ./cmtoken.tgz
```

Then, run the onboarding wizard or configuration command to set up CMToken:

```bash
# Recommended for first-time setup
openclaw onboard

# Or to modify existing configuration
openclaw configure
```

## Build Scripts

- `pnpm run build`: Bundles the plugin into `dist/index.js`.
- `pnpm run pack`: Bundles and packages the plugin into `cmtoken.tgz`.
