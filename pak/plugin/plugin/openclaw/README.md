# clawbot-hub OpenClaw Channel Extension

这是一个 **OpenClaw 原生 channel 扩展**，目标是像 feishu 一样安装后直接在 OpenClaw 配置里填写：

- `baseUrl`
- `appId`
- `appSecret`

即可连接 `clawbot-hub`。

## 目录用途

- `index.ts` / `api.ts` / `setup-entry.ts`：OpenClaw 插件入口
- `src/channel.ts`：channel 注册定义
- `src/gateway.ts`：登录、心跳、轮询、ACK 主循环
- `src/inbound.ts`：把 hub 入站消息分发给 OpenClaw
- `src/outbound.ts`：把 OpenClaw 回复推回 hub

## 前置条件

- `clawbot-hub backend` 已启动并可访问（默认 `http://127.0.0.1:8787`）
- 你已在 Hub 中拿到 `appId` 与 `appSecret`

## 安装方式

### 1) OpenClaw 本机安装（非 Docker）

将本目录复制到 OpenClaw 的全局扩展目录：

```bash
mkdir -p ~/.openclaw/extensions/clawbot-hub
rsync -a plugin/openclaw/ ~/.openclaw/extensions/clawbot-hub/
```

然后重启你当前正在运行的 OpenClaw gateway 进程（重启方式取决于你的启动方式）。

### 2) OpenClaw Docker 安装

仍然复制到宿主机的 `~/.openclaw/extensions`（不是容器内 `/app/extensions`）：

```bash
mkdir -p ~/.openclaw/extensions/clawbot-hub
rsync -a plugin/openclaw/ ~/.openclaw/extensions/clawbot-hub/
```

然后在 OpenClaw compose 目录重启 gateway：

```bash
docker compose restart openclaw-gateway
```

## 配置 `openclaw.json`

### 本机 OpenClaw + 本机 clawbot-hub

```json
{
  "plugins": {
    "entries": {
      "clawbot-hub": {
        "enabled": true
      }
    }
  },
  "channels": {
    "clawbot-hub": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8787",
      "appId": "cb_app_xxx",
      "appSecret": "cb_sec_xxx",
      "openclawInstanceId": "openclaw-local-1",
      "pollTimeoutMs": 1000,
      "heartbeatIntervalMs": 15000
    }
  }
}
```

### Docker OpenClaw + 宿主机 clawbot-hub

`baseUrl` 请使用 `host.docker.internal`：

```json
{
  "plugins": {
    "entries": {
      "clawbot-hub": {
        "enabled": true
      }
    }
  },
  "channels": {
    "clawbot-hub": {
      "enabled": true,
      "baseUrl": "http://host.docker.internal:8787",
      "appId": "cb_app_xxx",
      "appSecret": "cb_sec_xxx",
      "openclawInstanceId": "openclaw-local-1",
      "pollTimeoutMs": 1000,
      "heartbeatIntervalMs": 15000
    }
  }
}
```

其中 `accountId/openclawInstanceId` 可选。  
若不填 `accountId`，插件会自动使用：`clawbot-hub-${appId}`。

## 验证是否加载成功

### 本机 OpenClaw

```bash
openclaw plugins list --enabled | grep -i clawbot-hub
openclaw channels list | grep -i "ClawBot Hub"
openclaw channels status | grep -i "ClawBot Hub"
```

### Docker OpenClaw

```bash
docker compose run --rm openclaw-cli plugins list --enabled | grep -i clawbot-hub
docker compose run --rm openclaw-cli channels list | grep -i "ClawBot Hub"
docker compose run --rm openclaw-cli channels status | grep -i "ClawBot Hub"
```

期望看到类似：

- `@clawbot-hub/openclaw-channel ... loaded`
- `ClawBot Hub default: configured ... enabled`
- `ClawBot Hub default: enabled, configured, running`

## 常见问题

- `channels list` 里显示 `not configured, base=[missing]`：
  - 检查 `channels.clawbot-hub.baseUrl/appId/appSecret` 是否写在正在生效的 `openclaw.json` 中。
- Docker 下访问不到 Hub：
  - 若 Hub 在宿主机，`baseUrl` 应为 `http://host.docker.internal:8787`，不要写 `127.0.0.1`。
- 日志提示 `plugins.allow is empty`：
  - 这是安全提示，不影响加载。若需要，可在 `plugins.allow` 中显式加入 `clawbot-hub`。
