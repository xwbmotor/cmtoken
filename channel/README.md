# Tuken OpenClaw Channel Extension

这是一个 **OpenClaw 原生 Channel 扩展**，目标是和 Feishu 渠道一样，安装后直接在 OpenClaw 配置中填写：

- `baseUrl`
- `appId`
- `appSecret`

即可完美连接 `tuken`。

## 目录结构与功能用途

- `index.ts` / `api.ts` / `setup-entry.ts`：OpenClaw 插件核心接入与生命周期入口。
- `src/channel.ts`：Channel 注册与核心配置定义。
- `src/gateway.ts`：连接登录、心跳握手、长轮询、ACK 应答的主控制循环。
- `src/inbound.ts`：将 Tuken 接收到的用户入站消息，格式化并分发给 OpenClaw 决策执行。
- `src/outbound.ts`：将 OpenClaw 的智能体回复，实时推送/推回给 Tuken 服务端。
- `scripts/build.mjs`：仿照 CMToken 风格编写的极简高性能打包脚本，支持热构建及一键打出干净自包含的 `.tgz` 分发包。

## 前置条件

- `tuken backend` 服务已启动并可正常访问（默认 `http://127.0.0.1:8787`）。
- 您已在 Tuken 平台中获取到对应的 `appId` 与 `appSecret`。

## 开发与安装方式

本插件已支持与 `cmtoken` 完全一致的高标准自动化打包和安装流程，目前摒弃了繁琐的手动拷贝和环境污染：

### 1) 本地打包与构建

在插件根目录下，直接执行以下指令：
```bash
# 执行打包，会在 releases/ 目录下自动生成经过 esbuild 极致压缩及路径重写的 tuken-v0.6.0.tgz 包
npm run pack
```

### 2) 一键安装到 OpenClaw

在 OpenClaw 主程序根目录下，直接使用 OpenClaw CLI 将其安装至全局扩展目录中（由于打包后的代码包含网络交互及配置读取，需使用安全旁路参数授权安装）：
```bash
node openclaw.mjs plugins install --dangerously-force-unsafe-install [path-to-tuken]/channel/releases/tuken-v0.6.0.tgz
```

安装完成后，根据提示重启您的 OpenClaw 网关（gateway）即可自动加载。

---

## 配置文件 `openclaw.json`

在您的 `~/.openclaw/openclaw.json` 配置文件中，增加以下配置节点：

### A. 本地网关直连本地 Tuken
```json
{
  "plugins": {
    "entries": {
      "tuken": {
        "enabled": true
      }
    }
  },
  "channels": {
    "tuken": {
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

### B. Docker 网关直连宿主机 Tuken (推荐)
将 `baseUrl` 的宿主机地址指定为 `host.docker.internal`：
```json
{
  "plugins": {
    "entries": {
      "tuken": {
        "enabled": true
      }
    }
  },
  "channels": {
    "tuken": {
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

*提示：`accountId/openclawInstanceId` 为可选属性。若不显式指定 `accountId`，插件会自动按 `tuken-${appId}` 生成对应的默认账号。*

---

## 验证加载状态

在网关重启后，可通过 CLI 快捷指令查看装载情况：

### 本机 OpenClaw
```bash
# 检查插件是否已被正确加载
openclaw plugins list

# 检查 channels 支持列表中是否包含 Tuken
openclaw channels list

# 检查当前 Tuken 渠道的实时运行状态
openclaw channels status
```

### Docker 容器 OpenClaw
```bash
docker compose run --rm openclaw-cli plugins list
docker compose run --rm openclaw-cli channels list
docker compose run --rm openclaw-cli channels status
```

**期望输出类似结果：**
- 插件列表：`@tuken/openclaw-channel ... loaded`
- 渠道列表：`Tuken default: configured ... enabled`
- 运行状态：`Tuken default: enabled, configured, running`

---

## 常见问题

1. **`channels list` 里显示 `not configured, base=[missing]`**
   * 检查 `channels.tuken.baseUrl` / `appId` / `appSecret` 的拼写 and 值，是否正确写在正在生效的 `~/.openclaw/openclaw.json` 配置文件中。
2. **Docker 网关下无法连接宿主机 Tuken 后端**
   * 如果 Tuken 后端部署在宿主机上，在容器内的 OpenClaw 中，`baseUrl` 必须配置为 `http://host.docker.internal:8787`，不要配置为局域网或回环地址 `127.0.0.1`。
3. **日志输出 `[plugins] plugins.allow is empty`**
   * 这是 OpenClaw 的非绑定插件自动加载安全提示，不影响插件的正常加载及网关工作。若希望清除该警告，可在配置文件的 `plugins.allow` 字段中显式添加 `"tuken"`。
