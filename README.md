# CMToken Plugin for OpenClaw

> OpenClaw 插件 —— 通过中国移动一键认证（手机号登录）自动绑定 Token Plan 套餐 API Key，无缝接入中国移动 MaaS 平台的 AI 模型服务。

## 功能特性

- 🔐 **一键认证**：支持中国移动 OAuth 设备码流程，手机号扫码即可登录
- 🔑 **API Key 认证**：也支持直接使用 API Key 认证
- 🤖 **自动模型发现**：自动获取中国移动 MaaS 平台可用模型列表
- 🔄 **Token 自动刷新**：OAuth Token 过期前自动续期
- 📦 **一键安装/更新**：支持 Linux、macOS、Windows 全平台

## 支持的模型

| 模型 | 说明 |
|------|------|
| MiniMax-M2.5 | MiniMax 2.5 推理模型 |

> 模型列表会根据套餐动态更新。

## 安装

### 方式一：一键脚本（推荐）

**Linux / macOS / WSL：**
```bash
curl -fsSL http://YOUR_SERVER:19000/install | bash
```

**Windows PowerShell：**
```powershell
powershell -ExecutionPolicy Bypass -Command "iwr http://YOUR_SERVER:19000/install -UseBasicParsing | iex"
```

**全平台 Python：**
```bash
python3 -c "import urllib.request;exec(urllib.request.urlopen('http://YOUR_SERVER:19000/install').read())"
```

### 方式二：手动安装

1. 下载 `cmtoken.tgz`
2. 运行：
```bash
openclaw plugins install cmtoken.tgz
```

## 配置

安装后在 `openclaw.json` 中会自动生成配置：

```json
{
  "models": {
    "providers": {
      "cmtoken": {
        "baseUrl": "http://maas.gd.chinamobile.com:36007/ai/uifm/open/v1",
        "api": "openai-completions",
        "models": [
          {
            "id": "minimax-m25",
            "name": "minimax-2.5",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

### OAuth 配置（可选）

```json
{
  "plugins": {
    "cmtoken": {
      "baseUrl": "http://maas.gd.chinamobile.com:36007/ai/uifm/open/v1",
      "discoveryUrl": "http://maas.gd.chinamobile.com:36007/ai/uifm/open/v1/models",
      "oauthBaseUrl": "https://testcert.cmpassport.com:7002/oauth2-service",
      "clientId": "client-123"
    }
  }
}
```

## 使用

### 通过向导配置
```bash
openclaw wizard
# 选择 "CMToken OAuth" 或 "CMToken API Key"
```

### 使用模型
```
# 在 openclaw.json 中设置
"model": "cmtoken/minimax-m25"
```

## 项目结构

```
cmtoken-plugin/
├── README.md                    # 本文件
├── src/                         # 插件源码
│   ├── package.json             # npm 包配置
│   ├── openclaw.plugin.json     # OpenClaw 插件配置
│   └── index.js                 # 插件主入口（编译后）
├── scripts/                     # 安装脚本
│   ├── install.sh               # Linux/macOS 安装脚本
│   ├── install.ps1              # Windows PowerShell 安装脚本
│   ├── install.py               # Python 跨平台安装脚本
│   ├── install-simple.sh        # 简化版 Linux 安装
│   ├── install-simple.ps1       # 简化版 Windows 安装
│   └── serve.py                 # 分发服务器
├── LICENSE                      # MIT 许可证
└── .gitignore
```

## 分发服务器

`scripts/serve.py` 是一个轻量级 HTTP 分发服务器，用于提供插件包下载：

```bash
python3 scripts/serve.py
# 启动在 :19000 端口
```

支持自动检测客户端 OS 返回对应安装脚本。

## 技术细节

- **认证方式**：OAuth 2.0 Device Code Grant（设备码流程）
- **PKCE**：使用 S256 code challenge 增强安全性
- **Token 存储**：由 OpenClaw 框架安全管理
- **API 协议**：OpenAI Completions 兼容接口

## License

MIT
