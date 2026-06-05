# CMToken 插件

这是一个 OpenClaw 的模型提供商插件，支持 CMToken 身份验证（通过手机号进行 OAuth）以及模型推理。

## 特性

- **解耦**：独立于 OpenClaw Monorepo 源代码。






## 快速上手与安装

此插件已发布至 NPM，您可以直接通过 OpenClaw 提供的命令行工具进行安装与升级。

### 1. 安装插件

在终端中执行以下命令直接从线上安装最新版：

```bash
openclaw plugins install cmtoken
```

### 2. 配置与使用

安装完成后，运行 OpenClaw 的配置向导：

```bash
openclaw configure
```
在向导的 Provider 列表中选择 `CMToken`，您可以选择：
- **OAuth 授权**：通过浏览器扫码快捷登录
- **API Key 授权**：手动输入您的 CMToken Key

配置完成后即可在对话中使用 CMToken 支持的模型！

---

## 强制升级与重置

如果插件发布了新版本（例如修复了网络波动导致的问题），或者您发现当前插件状态异常，可以使用 `--force` 参数**强制重新拉取并覆盖安装最新版**：

```bash
openclaw plugins install cmtoken --force
```

**⚠️ 注意：**
升级完成后，建议您重新运行一次 `openclaw configure` 以确保最新配置生效。如果遇到依然加载旧版界面的玄学缓存问题，请尝试杀掉后台的 Node.js 进程重启 OpenClaw 守护进程：
```bash
# Windows
taskkill /f /im node.exe
# MacOS/Linux
killall node
```

