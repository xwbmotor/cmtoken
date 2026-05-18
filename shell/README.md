# CMToken & Tuken — 一键全自动部署与激活系统

本目录包含了用于 **OpenClaw 主机服务、CMToken 提供商插件、以及 Tuken 渠道插件** 的全平台一键自动化部署、换券激活与免配置连通系统。

本套工具支持 **在线智能匹配下载** 以及 **100% 纯内网物理隔离的全离线部署**。

---

## 📁 目录文件结构说明

```text
shell/
├── install.sh         # Linux / macOS 专属一键安装脚本 (100% POSIX 纯净语法兼容)
├── install.bat        # Windows 专属一键双击/命令行启动入口 (自动绕过执行策略)
├── install.ps1        # Windows 原生 PowerShell 安装部署引擎 (支持绿色包自提取与网络下载)
├── README.md          # 本部署系统说明文档
└── packet/            # 离线大包打包工具集目录
    ├── build.mjs      # 多平台专属离线大包 (openclaw.install.<platform>.tgz) 自动化打包脚本
    └── README.md      # 打包工具集使用指南
```

---

## ⚙️ 核心配置参数说明

为了保证脚本的中立性、纯净度与安全性，**脚本内不包含任何默认的主机域名或下载源地址**。在执行在线部署或激活换券时，系统需要您指定以下两个关键服务配置：

### 1. 参数定义与平台识别机制

* **🤖 兔啃部署换券接口地址 (`--exchange-url` / `-ExchangeUrl`)**
  * **作用**：向您中移认证中心的接口提交 `temp_token` 和宿主 Host ID，用以立即销毁 Temp Token 并换回 `device_token`（OAuth 刷新令牌）和 `pair_token`（渠道配对令牌）。
  * **默认值**：空（在线激活时为 **必填项**）。
  * **免配置绑定机制**：激活配对成功后，该地址会自动作为前缀（去除 `/open/v1` 等接口后缀）写入 Tuken 渠道的 `baseUrl` 中，实现整套系统零人工干预的端到端连通！

* **📦 离线安装大包下载源前缀 (`--pack-url` / `-PackUrl`)**
  * **作用**：在线下载模式下，如果您本地同级目录没有放置离线大包，脚本会向此地址发起网络下载请求。
  * **默认值**：空（若同级不存在离线包且需网络下载时为 **必填项**）。
  * **平台动态匹配黑科技**：
    您**只需要配置下载源的前缀地址**即可（如 `http://mycdn.com/files`），脚本会在运行时**全自动、动态识别当前的操作系统平台**，并自动追加对应的文件名（如 macOS 自动拉取 `/openclaw.install.mac.tgz`，Windows 自动拉取 `/openclaw.install.win.tgz`）！

---

## 🚀 用户部署指南 (Deployment Guide)

部署系统提供两种工作模式，极大地方便了不同网络环境下的企业客户：

### 模式 A：100% 纯本地离线部署（推荐，零网速限制，安全合规）

将预先打包好的平台专属离线包（如 Windows 的 `openclaw.install.win.tgz` 或 Linux 的 `openclaw.install.linux.tgz`）与部署脚本放在 **同级目录下**：

* **🐧 Linux / macOS**：
  ```bash
  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <YOUR_EXCHANGE_URL>
  ```
  *脚本检测到同级离线包后会自动进入纯本地解压模式，跳过网络下载，10 秒内即可完成绿色环境部署与令牌授权！*

* **💻 Windows (双击或 CMD 命令行)**：
  ```cmd
  install.bat --bot-token <YOUR_TEMP_TOKEN> --exchange-url <YOUR_EXCHANGE_URL>
  ```

---

### 模式 B：在线网络自动匹配部署

如果目标主机可以直接连通网络，且局域网/公网下架设了静态包分发服务：

* **🐧 Linux / macOS**：
  ```bash
  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL> --pack-url <URL_PREFIX>
  ```
  *示例：`--pack-url "http://intranet.local/packages"` 运行在 Mac 上时，脚本会自动请求 `http://intranet.local/packages/openclaw.install.mac.tgz`！*

* **💻 Windows (使用 install.bat)**：
  ```cmd
  install.bat --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL> --pack-url <URL_PREFIX>
  ```

* **💻 Windows (原生 PowerShell)**：
  ```powershell
  .\install.ps1 -BotToken <YOUR_TEMP_TOKEN> -ExchangeUrl <EXCHANGE_URL> -PackUrl <URL_PREFIX>
  ```

---

### 模式 C：极轻量级独立插件安装模式 (Ultra-lightweight Plugin-only Mode)

**适用场景**：如果目标机器或当前开发环境下**已经预装或运行了 OpenClaw**（不论是通过 npm 全局安装、系统服务安装，还是直接作为 Git 工作区目录），您**无需重复下载多达上百兆的多平台运行底座与 Node.js 绿色大包**，脚本会自动检测当前的 `openclaw` 指令或同级工作区。

#### 1. 纯本地极速部署
如果您本地已经有编译好的 CMToken 和 Tuken 插件 `.tgz` 包（可以从 `shell/releases/` 复制，或者通过 `pnpm run pack` 编译）：
* **🐧 Linux / macOS**：
  ```bash
  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <YOUR_EXCHANGE_URL>
  ```
  *(脚本会自动寻找并优先安装本地 `cmtoken-v1.0.0-prod.tgz` 与 `tuken-v0.6.0.tgz` 两个插件！整个过程只需不到 1 秒且无需网络)*

* **💻 Windows (使用 install.bat)**：
  ```cmd
  install.bat --bot-token <YOUR_TEMP_TOKEN> --exchange-url <YOUR_EXCHANGE_URL>
  ```

#### 2. 在线极简轻量下载
如果本地没有插件包，您只需要指定下载源前缀，脚本会**只下载这两个轻量级插件文件**（文件大小仅几百 KB 级别），而完全不下载底座：
* **🐧 Linux / macOS**：
  ```bash
  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL> --pack-url <URL_PREFIX>
  ```
* **💻 Windows (使用 install.bat)**：
  ```cmd
  install.bat --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL> --pack-url <URL_PREFIX>
  ```

---

### 🖥️ 系统守护进程服务化部署 (System Service / Daemon Installation)

OpenClaw 核心内部集成了**极其完善的原生系统服务管理模块**。由于部署系统已自动为宿主机配置了全局绿色便携版 `openclaw` 命令行，在一键部署完成后，您可以非常轻松地将 OpenClaw 网关注册为系统级开机自启服务：

#### A. Linux 系统 (注册为 systemd 系统守护进程)：
在 Linux 环境下，脚本部署执行完毕后直接输入以下命令（非 root 用户执行时，系统会自动提示输入 sudo 密码完成注册）：
```bash
# 1. 一键注册并生成系统服务
openclaw daemon install

# 2. 启动系统服务
openclaw daemon start

# 3. 随时查看服务运行状态与网关健康度
openclaw daemon status
```

#### B. Windows 系统 (注册为系统服务/计划任务)：
在 Windows 环境下，直接在命令行（CMD 或 PowerShell）中运行：
```cmd
# 1. 一键注册为自启动服务
openclaw daemon install
# （提示：若当前终端没有管理员特权，OpenClaw 会自动降级并无缝回退注册为当前用户的“开始菜单 - 启动项”，实现无需管理员权限的 100% 纯绿色开机自启动！）

# 2. 启动服务 / 查看健康度
openclaw daemon start
openclaw daemon status
```

#### C. 服务管理常用命令一览：
* **停止服务**：`openclaw daemon stop`
* **重启服务**：`openclaw daemon restart`
* **卸载并清理服务**：`openclaw daemon uninstall`

---


## 🛠️ 打包分发指南 (Distribution Guide)

作为系统管理员或项目分发方，如果需要编译、制作各平台的离线包并统一分发，请遵循以下简单步骤：

### 1. 编译并生成最新版插件包
在打包前确保本地最新的插件代码已生成对应的 `.tgz` 压缩包：
```bash
# 编译并打包 CMToken 提供商插件
pnpm run pack --env=prod

# 编译并打包 Tuken 渠道插件
cd channel
pnpm run pack
cd ..
```

### 2. 一键多平台大包制作
运行打包脚本。打包器会自动拉取最新的 OpenClaw 核心，结合绿色免配置 Node.js 运行环境与您刚刚编译的双插件，全自动分类打包：
```bash
# 一键生成全部平台 (Windows, Linux, macOS) 的离线大包 (推荐)
node shell/packet/build.mjs --all
```

执行完毕后，所有编译大包及最新的安装脚本会**自动归集在 `shell/releases/` 目录下**。您只需将 `shell/releases/` 目录整体压缩发送给客户即可，体验极其纯净专业！

---

## 🛡️ 核心黑科技特性说明

1. **HTTPS/SSL 证书链路自检**：
   在专网、企业内网、或存在安全网关拦截的自签名证书环境下，脚本会在 1 秒内自动完成证书握手探测。一旦发现证书校验异常，将**静默开启 Insecure 安全旁路模式**（自动为 curl 追加 `-k`，为 Node.js 进程注入环境变量 `NODE_TLS_REJECT_UNAUTHORIZED=0`），彻底杜绝因证书链断裂导致的部署失败。
2. **多包管理器适配与自动补全**：
   Linux 系统下，若系统缺失 `curl`, `tar` 等基本解压网络工具，脚本会智能检测系统环境，自动调用 `apt-get`, `yum`, `dnf`, `brew` 进行静默补充安装，达到开箱即用的闭环。
3. **绿色运行底座免配自启动**：
   一键部署成功后，系统会自动解析换券服务器接口，推导 Tuken Hub 的 `baseUrl`，写入配对 AppId、AppSecret 以及中移最新的 Refresh Token，并自动执行网关 `gateway run` 启动命令，整个安装生命周期零人工介入。
4. **全局绿色 CLI 命令行包装器 (openclaw 命令全局随处可用)**：
   脚本部署完成后，会**自动在本地应用 bin 目录下生成对应操作系统平台（Linux/macOS 专属 shell，Windows 专属 bat 和 ps1）的绿色 openclaw 二进制包装器**，硬编码绑定便携版 Node 路径，并自动将其安全追加写入到当前用户的 Shell 配置文件（如 `.bashrc`/`.zshrc`）或 Windows 的用户 `Path` 环境变量中（**完全免系统管理员/Root权限**）。
   这使得用户部署完成后，**可以随时随地直接在任意命令行窗口中直接运行官方的 `openclaw` 命令**（如 `openclaw gateway run` / `openclaw plugins list`），体验完全等同于全局 npm 显式安装，却对宿主机操作系统做到了 100% 绿色纯净与零副作用！

