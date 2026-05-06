# CMToken Plugin

This is a model provider plugin for OpenClaw that supports CMToken authentication (OAuth via phone number) and model inference.

## Features

- **Decoupled**: Independent of the OpenClaw monorepo source code.
- **Configurable**: All API and OAuth endpoints can be customized via environment variables.

## Prerequisites

- **Node.js**: Version 22 or higher.
- **npm** or **pnpm**: For dependency management.

## Installation

1.  **Extract**: Copy this folder to your desired location.
2.  **Dependencies**:
    ```bash
    npm install
    ```
3.  **Build**:
    ```bash
    npm run build
    ```
4.  **Package**:
    ```bash
    npm run pack
    ```
    This generates a `cmtoken.tgz` file.


## Usage in OpenClaw

Install the generated `.tgz` package directly:

```bash
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

- `npm run build`: Bundles the plugin into `dist/index.js`.
- `npm run pack`: Bundles and packages the plugin into `cmtoken.tgz`.
