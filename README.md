# CMToken Standalone Plugin

This is a standalone model provider plugin for OpenClaw that supports CMToken authentication (OAuth via phone number) and model inference.

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

## Configuration (Environment Variables)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `CMTOKEN_BASE_URL` | Inference API base URL | `http://maas.gd.chinamobile.com:36007/ai/uifm/open/v1` |
| `CMTOKEN_DISCOVERY_URL` | Model discovery API endpoint | `http://agent.nat300.top/api/v1/models` |
| `CMTOKEN_OAUTH_URL` | OAuth server base URL | `http://agent.nat300.top` |


## Usage in OpenClaw

Install the generated `.tgz` package directly:

```bash
openclaw plugins install ./cmtoken.tgz
```

Then, run the onboarding wizard to configure CMToken:

```bash
openclaw onboard
```

## Build Scripts

- `npm run build`: Bundles the plugin into `dist/index.js`.
- `npm run pack`: Bundles and packages the plugin into `cmtoken.tgz`.
