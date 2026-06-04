# CMToken 插件

这是一个 OpenClaw 的模型提供商插件，支持 CMToken 身份验证（通过手机号进行 OAuth）以及模型推理。

## 特性

- **解耦**：独立于 OpenClaw Monorepo 源代码。

## 前提条件

- **Node.js**：版本 22 或更高。
- **npm** 或 **pnpm**：用于依赖管理。

## 安装步骤

1. **解压**：将此文件夹复制到您期望的位置。
2. **安装依赖**：
    ```bash
    pnpm install
    ```

## 环境配置

所有 API 和 OAuth 端点均在 `environments.json` 中进行管理。由于此文件包含潜在的敏感 URL，因此已被 Git 忽略。

首先，复制示例文件：
```bash
cp environments.json.example environments.json
```
然后，修改 `environments.json` 以自定义内置地址：

```json
{
  "test": {
    "BASE_URL": "...",      // 推理 API 基地址
    "DISCOVERY_URL": "...", // 模型发现端点
    "OAUTH_URL": "...",     // OAuth 服务器基地址
    "CLIENT_ID": "..."      // OAuth 客户端 ID
  },
  "prod": { ... }
}
```

---

## 构建与打包

### 🧪 测试环境（默认）
用于本地开发和测试。

```bash
# 仅构建
pnpm run build

# 构建并打包（生成 cmtoken.tgz）
pnpm run pack
```

### 🚀 生产环境
用于使用官方端点的最终发布。

```bash
# 仅构建
node scripts/build.mjs --env=prod

# 构建并打包（生成 cmtoken.tgz）
node scripts/build.mjs --env=prod --pack
```


## 在 OpenClaw 中使用

直接安装生成的 `.tgz` 包：

```bash
openclaw plugins install ./cmtoken.tgz
```

如果您已经安装了旧版本，可以通过运行相同的安装命令进行更新，或者先卸载旧版本：

```bash
# 先卸载（可选）
openclaw plugins uninstall cmtoken

# 然后安装新版本
openclaw plugins install ./cmtoken.tgz
```

然后，运行新手引导向导或配置命令来设置 CMToken：

```bash
# 推荐首次设置时使用
openclaw onboard

# 或者修改现有配置
openclaw configure
```

## 构建脚本

- `pnpm run build`：将插件打包至 `dist/index.js`。
- `pnpm run pack`：将插件打包并压缩为 `cmtoken.tgz`。
