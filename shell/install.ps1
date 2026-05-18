# ==============================================================================
# CMToken & Tuken — OpenClaw Windows Native Auto-Deploy & Activation Script
# ==============================================================================
#
# Description:
#   This PowerShell script mirrors the bash install.sh script, providing 100%
#   native, out-of-the-box Windows deployment using built-in Windows utilities
#   (tar.exe, PowerShell) and portable bundled Node.js.
#
# ==============================================================================

[CmdletBinding()]
param (
    [Parameter(Mandatory=$true)]
    [string]$BotToken,
    
    [Parameter(Mandatory=$false)]
    [string]$InstallDir = "$Home\.openclaw-app",
    
    [Parameter(Mandatory=$false)]
    [string]$ExchangeUrl = "",
    
    [Parameter(Mandatory=$false)]
    [string]$PackUrl = ""
)

# Style & Colors
function log-info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function log-success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function log-warning($msg) { Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function log-error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── 1. 参数合理性校验 ────────────────────────────────────────────────────────
if ([string]::IsNullOrEmpty($ExchangeUrl)) {
    log-error "缺少必需参数 -ExchangeUrl (部署换券接口地址)！"
    log-error "在线部署或激活配对时，请指定您中移认证中心的部署换券接口地址。"
    log-error "使用示例: .\install.ps1 -BotToken <YOUR_TOKEN> -ExchangeUrl <EXCHANGE_URL>"
    exit 1
}

# ── 1.5 HTTPS/SSL 证书校验自检 ────────────────────────────────────────────────
log-info "正在进行 HTTPS 证书链路与网络连通性自检..."
$insecure = $false
try {
    # 尝试握手探测
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadString($ExchangeUrl) > $null
} catch [System.Net.WebException] {
    $ex = $_.Exception
    if ($ex.Status -eq [System.Net.WebExceptionStatus]::TrustFailure -or $ex.Message -like "*Trust*" -or $ex.Message -like "*SSL*") {
        $insecure = $true
    }
} catch {
    # 忽略其他网络异常，交由后续网络下载阶段处理
}

if ($insecure) {
    log-warning "⚠️ 自检发现当前网络存在 HTTPS 证书信任问题 (如自签名证书或专网拦截)。"
    log-warning "   已自动激活 Insecure 旁路模式（忽略 TLS/SSL 校验）！"
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    [Environment]::SetEnvironmentVariable("NODE_TLS_REJECT_UNAUTHORIZED", "0", "Process")
} else {
    log-success "HTTPS 链路证书校验正常，采用标准加密模式。"
}

# ── 2. 本地离线包检索与智能下载 ──────────────────────────────────────────────
$offlineFile = "openclaw.install.win.tgz"
$genericFile = "openclaw.install.tgz"
$stagingDir = "$InstallDir\staging"

if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$isPluginOnly = $false

# 检查系统是否已具备全局/工作区 OpenClaw
$globalOpenClawOk = $false
if (Get-Command "openclaw" -ErrorAction SilentlyContinue) {
    $globalOpenClawOk = $true
} elseif (Test-Path "..\..\openclaw\package.json") {
    $globalOpenClawOk = $true
}

# 检查本地是否有任何离线大包
$hasOfflinePackage = $false
if (Test-Path ".\$offlineFile") { $hasOfflinePackage = $true }
elseif (Test-Path ".\$genericFile") { $hasOfflinePackage = $true }
elseif (Test-Path "$offlineFile") { $hasOfflinePackage = $true }
elseif (Test-Path "$genericFile") { $hasOfflinePackage = $true }

if ($globalOpenClawOk) {
    $isPluginOnly = $true
    log-success "检测到系统已具备全局/工作区 OpenClaw 服务。"
    log-info "🚀 将自动进入【极轻量级插件独立安装模式】！直接通过现有的 openclaw 命令进行插件安全装载。"
}

$offlineFilePath = ""
if (!$isPluginOnly) {
    if (Test-Path ".\$offlineFile") {
        log-success "检测到同级存在 Windows 专属离线包: .\$offlineFile，跳过下载。"
        $offlineFilePath = (Get-Item ".\$offlineFile").FullName
    } elseif (Test-Path ".\$genericFile") {
        log-success "检测到同级存在通用离线包: .\$genericFile，跳过下载。"
        $offlineFilePath = (Get-Item ".\$genericFile").FullName
    } elseif (Test-Path "$offlineFile") {
        log-success "检测到本地存在 Windows 专属离线包: $offlineFile，跳过下载。"
        $offlineFilePath = (Get-Item "$offlineFile").FullName
    } elseif (Test-Path "$genericFile") {
        log-success "检测到本地存在通用离线包: $genericFile，跳过下载。"
        $offlineFilePath = (Get-Item "$genericFile").FullName
    } else {
        # 在线下载模式：没有本地文件，必须配置离线大包下载源前缀
        if ([string]::IsNullOrEmpty($PackUrl)) {
            log-error "缺少离线安装大包下载源前缀配置 PackUrl！"
            log-error "在线部署模式下，请通过参数 -PackUrl <URL_PREFIX> 指定下载源前缀地址（例如：http://intranet.local/packages）。"
            exit 1
        }

        $packPrefix = $PackUrl.TrimEnd('/')
        if ($packPrefix -like "*.tgz") {
            if ($packPrefix -like "*openclaw.install.tgz") {
                $downloadUrl = $packPrefix.Replace("openclaw.install.tgz", "openclaw.install.win.tgz")
            } else {
                $downloadUrl = $packPrefix
            }
        } else {
            $downloadUrl = "${packPrefix}/openclaw.install.win.tgz"
        }

        log-info "未检测到本地离线部署包，正在从网络智能获取平台专属包..."
        log-info "下载源 URL: $downloadUrl"
        
        $downloadPath = "$InstallDir\$offlineFile"
        if ($insecure) {
            # 使用内建 curl.exe -k 绕过自签名证书限制
            & curl.exe -k -L -o "$downloadPath" "$downloadUrl"
        } else {
            & curl.exe -L -o "$downloadPath" "$downloadUrl"
        }
        
        if (!(Test-Path $downloadPath) -or (Get-Item $downloadPath).Length -eq 0) {
            log-error "离线部署包下载失败，请检查网络或配置的 PackUrl 地址！"
            exit 1
        }
        $offlineFilePath = $downloadPath
        log-success "离线包下载成功！路径: $offlineFilePath"
    }

    # ── 3. 离线包解压暂存 ────────────────────────────────────────────────────────
    log-info "正在解压离线包至暂存区..."
    if (Test-Path $stagingDir) {
        Remove-Item -Path $stagingDir -Recurse -Force | Out-Null
    }
    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

    # 使用 Windows 内置 tar.exe 进行解压
    & tar.exe -xzf "$offlineFilePath" -C "$stagingDir"
    log-success "离线包提取完成！"
} else {
    # 极简模式：定位并下载/使用插件
    log-info "正在定位并配置 CMToken 和 Tuken 插件..."
    $cmtokenTgzPath = ""
    $tukenTgzPath = ""

    # 1. 优先从同级目录获取
    if (Test-Path ".\cmtoken-v1.0.0-prod.tgz") {
        $cmtokenTgzPath = (Get-Item ".\cmtoken-v1.0.0-prod.tgz").FullName
        log-success "找到本地已编译 CMToken 插件: $cmtokenTgzPath"
    } elseif (Test-Path "cmtoken-v1.0.0-prod.tgz") {
        $cmtokenTgzPath = (Get-Item "cmtoken-v1.0.0-prod.tgz").FullName
        log-success "找到本地已编译 CMToken 插件: $cmtokenTgzPath"
    }

    if (Test-Path ".\tuken-v0.6.0.tgz") {
        $tukenTgzPath = (Get-Item ".\tuken-v0.6.0.tgz").FullName
        log-success "找到本地已编译 Tuken 渠道插件: $tukenTgzPath"
    } elseif (Test-Path "tuken-v0.6.0.tgz") {
        $tukenTgzPath = (Get-Item "tuken-v0.6.0.tgz").FullName
        log-success "找到本地已编译 Tuken 渠道插件: $tukenTgzPath"
    }

    # 2. 在线拉取轻量包
    if ([string]::IsNullOrEmpty($cmtokenTgzPath) -or [string]::IsNullOrEmpty($tukenTgzPath)) {
        if ([string]::IsNullOrEmpty($PackUrl)) {
            log-error "未在本地找到插件文件，且缺少 -PackUrl 下载前缀配置！"
            exit 1
        }
        $packPrefix = $PackUrl.TrimEnd('/')
        # 去除包文件名后缀
        $packPrefix = $packPrefix -replace "openclaw\.install\..*?\.tgz", ""
        $packPrefix = $packPrefix -replace "openclaw\.install\.tgz", ""
        $packPrefix = $packPrefix.TrimEnd('/')

        if ([string]::IsNullOrEmpty($cmtokenTgzPath)) {
            log-info "正在在线拉取轻量级 CMToken 插件..."
            $cmtokenTgzPath = "$InstallDir\cmtoken-v1.0.0-prod.tgz"
            if ($insecure) {
                & curl.exe -k -L -o "$cmtokenTgzPath" "${packPrefix}/cmtoken-v1.0.0-prod.tgz"
            } else {
                & curl.exe -L -o "$cmtokenTgzPath" "${packPrefix}/cmtoken-v1.0.0-prod.tgz"
            }
            if (!(Test-Path $cmtokenTgzPath) -or (Get-Item $cmtokenTgzPath).Length -eq 0) {
                log-error "在线拉取 CMToken 插件失败！请检查 -PackUrl 配置。"
                exit 1
            }
            log-success "CMToken 插件在线拉取成功！"
        }

        if ([string]::IsNullOrEmpty($tukenTgzPath)) {
            log-info "正在在线拉取轻量级 Tuken 渠道插件..."
            $tukenTgzPath = "$InstallDir\tuken-v0.6.0.tgz"
            if ($insecure) {
                & curl.exe -k -L -o "$tukenTgzPath" "${packPrefix}/tuken-v0.6.0.tgz"
            } else {
                & curl.exe -L -o "$tukenTgzPath" "${packPrefix}/tuken-v0.6.0.tgz"
            }
            if (!(Test-Path $tukenTgzPath) -or (Get-Item $tukenTgzPath).Length -eq 0) {
                log-error "在线拉取 Tuken 渠道插件失败！请检查 -PackUrl 配置。"
                exit 1
            }
            log-success "Tuken 渠道插件在线拉取成功！"
        }
    }
}

# ── 4. 环境与依赖部署 (全离线检测/装载) ───────────────────────────────────────
$nodePath = "node"
$npmPath = "npm"
$coreDir = "$InstallDir\openclaw-core"
$cliPath = "$coreDir\dist\cli\index.js"

if (!$isPluginOnly) {
    # 4.1 部署 Node.js 环境
    log-info "开始部署 Node.js 环境..."
$nodePortableDir = "$InstallDir\node-portable"
if (Test-Path $nodePortableDir) { Remove-Item -Path $nodePortableDir -Recurse -Force | Out-Null }
New-Item -ItemType Directory -Path $nodePortableDir -Force | Out-Null

$nodeZip = Get-ChildItem -Path $stagingDir -Filter "*node*.zip" | Select-Object -First 1
if ($nodeZip) {
    log-info "正在解压绿色版 Node.js: $($nodeZip.Name)"
    & tar.exe -xf $nodeZip.FullName -C $nodePortableDir
    $nodeDir = Get-ChildItem -Path $nodePortableDir -Directory | Select-Object -First 1
    $nodeBinDir = $nodeDir.FullName
    $nodePath = "$nodeBinDir\node.exe"
    $npmPath = "$nodeBinDir\npm.cmd"
} else {
    log-error "未在解压暂存区找到绿色版 Node.js 压缩包！"
    exit 1
}

# 4.2 部署 Git 环境
log-info "开始部署 Git 环境..."
$gitPortableDir = "$InstallDir\git-portable"
if (Test-Path $gitPortableDir) { Remove-Item -Path $gitPortableDir -Recurse -Force | Out-Null }
New-Item -ItemType Directory -Path $gitPortableDir -Force | Out-Null

$gitZip = Get-ChildItem -Path $stagingDir -Filter "*git*.zip" | Select-Object -First 1
if ($gitZip) {
    log-info "正在解压绿色版 Git: $($gitZip.Name)"
    & tar.exe -xf $gitZip.FullName -C $gitPortableDir
    $gitPath = "$gitPortableDir\cmd\git.exe"
} else {
    log-warning "未在解压暂存区找到绿色版 Git 压缩包，后续将依赖系统预装 Git。"
    $gitPath = "git"
}

# 将绿色版 Node.js & Git 注入当前 PowerShell 会话环境变量
$env:Path = "$nodeBinDir;$gitPortableDir\cmd;$env:Path"

# 4.3 提取 OpenClaw 核心程序
log-info "开始提取 OpenClaw 核心服务..."
$coreDir = "$InstallDir\openclaw-core"
if (Test-Path $coreDir) { Remove-Item -Path $coreDir -Recurse -Force | Out-Null }
New-Item -ItemType Directory -Path $coreDir -Force | Out-Null

$openclawTgz = "$stagingDir\openclaw.tar.gz"
if (Test-Path $openclawTgz) {
    & tar.exe -xzf $openclawTgz -C $coreDir
    # 若被包嵌套，自动移至最外层
    $nested = Get-ChildItem -Path $coreDir -Directory | Select-Object -First 1
    if ($nested) {
        $tempDir = "$InstallDir\temp-core"
        Move-Item -Path $nested.FullName -Destination $tempDir
        Remove-Item -Path $coreDir -Recurse -Force
        Move-Item -Path $tempDir -Destination $coreDir
    }
} else {
    log-error "未能在解压区找到 openclaw.tar.gz 核心代码！"
    exit 1
}

# 安装依赖模块
log-info "正在安装 OpenClaw 依赖模块..."
Push-Location $coreDir
& "$npmPath" install --omit=dev --no-audit --no-fund
Pop-Location

# ── 4.4 部署 Windows 绿色命令行包装器 ─────────────────────────────────────────
log-info "正在创建 Windows 绿色命令行包装器..."
$binDir = "$InstallDir\bin"
if (!(Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }

# 创建 CMD 批处理包装脚本
$batWrapperPath = "$binDir\openclaw.bat"
$batContent = @"
@echo off
"$InstallDir\node-portable\node.exe" "$InstallDir\openclaw-core\dist\cli\index.js" %*
"@
$batContent | Out-File -FilePath $batWrapperPath -Encoding ascii

# 创建 PowerShell 包装脚本
$psWrapperPath = "$binDir\openclaw.ps1"
$psContent = @"
& "$InstallDir\node-portable\node.exe" "$InstallDir\openclaw-core\dist\cli\index.js" `$args
"@
$psContent | Out-File -FilePath $psWrapperPath -Encoding utf8

# 将 bin 目录追加到当前用户 Path 环境变量中 (免管理员权限)
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$binDir*") {
        $newUserPath = "$userPath;$binDir"
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        log-success "已成功将 openclaw 添加到当前用户的 Path 环境变量中！"
    } else {
        log-success "用户环境变量 Path 中已包含 openclaw 路径。"
    }
} catch {
    log-warning "无法自动写入用户 Path 环境变量，您仍可在 $binDir 目录下手动调用 openclaw。"
}
} else {
    # 极简模式下，我们只需确定 node 和 cliPath（开发区下使用）
    if (Get-Command "openclaw" -ErrorAction SilentlyContinue) {
        $nodePath = "node"
    } elseif (Test-Path "..\..\openclaw\package.json") {
        $nodePath = "node"
        $coreDir = (Get-Item "..\..\openclaw").FullName
        $cliPath = "$coreDir\openclaw.mjs"
    }
}

# ── 5. 生成/读取 Host ID ─────────────────────────────────────────────────────
$hostIdFile = "$Home\.openclaw\host_id"
$hostIdDir = Split-Path $hostIdFile
if (!(Test-Path $hostIdDir)) { New-Item -ItemType Directory -Path $hostIdDir -Force | Out-Null }

$hostId = ""
if (Test-Path $hostIdFile) {
    $hostId = (Get-Content $hostIdFile).Trim()
} else {
    $hostId = [Guid]::NewGuid().ToString()
    $hostId | Out-File -FilePath $hostIdFile -NoNewline -Encoding utf8
}
log-success "宿主机 Host ID: $hostId"

# ── 6. 平台安全换券 (Node 进程隔离执行) ─────────────────────────────────────────
log-info "正在向兔啃换券服务申请设备授权与配对令牌..."
$osInfo = "Windows $([Environment]::OSVersion.VersionString)"
$nodeScript = @"
const http = require('http');
const url = require('url');

const payload = JSON.stringify({
  temp_token: "$BotToken",
  host_id: "$hostId",
  host_name: "$([Environment]::MachineName)",
  client_version: "1.0.0",
  os: "$osInfo"
});

const exchangeUrl = "$ExchangeUrl";
const parsedUrl = url.parse(exchangeUrl);

const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || 80,
  path: parsedUrl.path,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error(JSON.stringify({ error: e.message }));
});

req.write(payload);
req.end();
"@

$nodeScriptFile = "$InstallDir\exchange.js"
$nodeScript | Out-File -FilePath $nodeScriptFile -Encoding utf8

log-info "正在请求换券地址: $ExchangeUrl"
$responseStr = & "$nodePath" $nodeScriptFile
Remove-Item $nodeScriptFile -Force | Out-Null

if ([string]::IsNullOrEmpty($responseStr)) {
    log-error "换券服务无响应！"
    exit 1
}

# 解析服务响应
$parseScript = @"
try {
  const r = JSON.parse('$responseStr');
  if (r.code === 200 || r.status === 'success') {
    const data = r.data || {};
    console.log('SUCCESS|' + (data.device_token || '') + '|' + (data.pair_token || '') + '|' + (data.api_base || '') + '|' + (data.expires_in || '7200'));
  } else {
    console.log('ERROR|' + (r.msg || r.message || '未知错误'));
  }
} catch(e) {
  console.log('ERROR|JSON解析错误: ' + e.message);
}
"@

$parseScriptFile = "$InstallDir\parse.js"
$parseScript | Out-File -FilePath $parseScriptFile -Encoding utf8
$parsed = & "$nodePath" $parseScriptFile
Remove-Item $parseScriptFile -Force | Out-Null

$parts = $parsed.Split('|')
if ($parts[0] -eq "ERROR") {
    log-error "激活换券失败: $($parts[1])"
    exit 1
}

$deviceToken = $parts[1]
$pairToken = $parts[2]
$apiBase = $parts[3]
if ([string]::IsNullOrEmpty($apiBase)) {
    $apiBase = $ExchangeUrl.Substring(0, $ExchangeUrl.IndexOf("/open/v1")) + "/open/v1"
}
$expiresIn = $parts[4]
log-success "🎉 令牌换券成功，已授权该实例！"

# ── 7. 安装 CMToken 与 Tuken 插件 ───────────────────────────────────────────
log-info "开始定位插件并执行安全安装..."

if ($isPluginOnly) {
    $resolvedCmtokenTgz = $cmtokenTgzPath
    $resolvedTukenTgz = $tukenTgzPath
} else {
    $cmtokenTgz = Get-ChildItem -Path $stagingDir -Filter "*cmtoken*.tgz" | Select-Object -First 1
    $tukenTgz = Get-ChildItem -Path $stagingDir -Filter "*tuken*.tgz" | Select-Object -First 1
    if (!$cmtokenTgz -or !$tukenTgz) {
        log-error "未在解压 of 离线包中找到插件安装包！"
        exit 1
    }
    $resolvedCmtokenTgz = $cmtokenTgz.FullName
    $resolvedTukenTgz = $tukenTgz.FullName
}

# 执行插件安装
if ($isPluginOnly -and (Get-Command "openclaw" -ErrorAction SilentlyContinue)) {
    & openclaw plugins install $resolvedCmtokenTgz --dangerously-force-unsafe-install
} else {
    & "$nodePath" $cliPath plugins install $resolvedCmtokenTgz --dangerously-force-unsafe-install
}

if ($isPluginOnly -and (Get-Command "openclaw" -ErrorAction SilentlyContinue)) {
    & openclaw plugins install $resolvedTukenTgz --dangerously-force-unsafe-install
} else {
    & "$nodePath" $cliPath plugins install $resolvedTukenTgz --dangerously-force-unsafe-install
}

# ── 8. 模型与渠道自动配对 ─────────────────────────────────────────────────────
log-info "正在进行模型与渠道免配置自动连通绑定并执行模型自适应配置..."
$baseUrl = $ExchangeUrl.Substring(0, $ExchangeUrl.IndexOf("/open/v1"))

$configScript = @"
const fs = require('fs');
const path = require('path');

const home = process.env.USERPROFILE;
const clawDir = path.join(home, '.openclaw');
const agentDir = path.join(clawDir, 'agents', 'main', 'agent');
if (!fs.existsSync(agentDir)) {
  fs.mkdirSync(agentDir, { recursive: true });
}

(async () => {
  const deviceToken = "$deviceToken";
  const pairToken = "$pairToken";
  const hostId = "$hostId";
  const apiBase = "$apiBase";
  const exchangeUrl = "$ExchangeUrl";

  let finalModelsList = [
    {
      id: 'minmax',
      name: 'minmax',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 192000,
      maxTokens: 8192
    }
  ];
  let firstModelId = 'minmax';
  let activeAccessToken = 'initial_activation_token';
  let tokenExpiresIn = parseInt("$expiresIn") || 7200;

  // 1. 确定 OAUTH_URL
  let oauthUrl = 'https://agentlink.idaas.cmpassport.com/oauth2-service';
  if (exchangeUrl.includes('nat300') || exchangeUrl.includes('test')) {
    oauthUrl = 'https://testcert.cmpassport.com:7002/oauth2-service';
  }

  // 2. 使用 Refresh Token 换取首任 Access Token 并自动发现可用模型
  try {
    const tokenUrl = oauthUrl + '/oauth/device/token';
    const discoveryUrl = apiBase + '/models';

    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'refresh_token');
    tokenParams.append('client_id', hostId);
    tokenParams.append('client_secret', pairToken);
    tokenParams.append('refresh_token', deviceToken);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenParams.toString()
    });

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        activeAccessToken = tokenData.access_token;
        if (tokenData.expires_in) {
          tokenExpiresIn = parseInt(tokenData.expires_in);
        }

        console.log('📡 正在与中移认证中心交互，自动发现模型列表...');
        const modelsRes = await fetch(discoveryUrl, {
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + activeAccessToken
          }
        });

        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          const rawModels = Array.isArray(modelsData.models) ? modelsData.models : (modelsData.data && Array.isArray(modelsData.data) ? modelsData.data : null);
          if (rawModels && rawModels.length > 0) {
            finalModelsList = rawModels.map(m => ({
              id: m.id,
              name: m.name || m.id,
              reasoning: false,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: m.contextWindow || 192000,
              maxTokens: m.maxTokens || 8192
            }));
            firstModelId = finalModelsList[0].id;
            console.log('✅ 成功自动载入中移可用 AI 模型列表: ' + finalModelsList.map(m => m.id).join(', '));
          }
        } else {
          console.warn('⚠️ 获取模型列表失败，状态码:', modelsRes.status);
        }
      } else {
        console.warn('⚠️ 换取 Access Token 响应异常，缺 access_token 字段');
      }
    } else {
      console.warn('⚠️ 换取 Access Token 失败，状态码:', tokenRes.status);
    }
  } catch (err) {
    console.warn('⚠️ 自适应拉取中移模型列表异常，将回退至内置默认配置。错误:', err.message);
  }

  // 1. 写入 openclaw.json
  const openclawJsonPath = path.join(clawDir, 'openclaw.json');
  let openclawJson = {};
  if (fs.existsSync(openclawJsonPath)) {
    try { openclawJson = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8')); } catch(e) {}
  }
  openclawJson.plugins = openclawJson.plugins || {};
  openclawJson.plugins.entries = openclawJson.plugins.entries || {};

  // 配置 CMToken 插件 (非破坏性合并)
  openclawJson.plugins.entries['cmtoken'] = openclawJson.plugins.entries['cmtoken'] || {};
  openclawJson.plugins.entries['cmtoken'].enabled = true;
  openclawJson.plugins.entries['cmtoken'].config = openclawJson.plugins.entries['cmtoken'].config || {};
  openclawJson.plugins.entries['cmtoken'].config.appId = hostId;
  openclawJson.plugins.entries['cmtoken'].config.appSecret = pairToken;
  openclawJson.plugins.entries['cmtoken'].config.defaultModel = 'cmtoken/' + firstModelId;
  openclawJson.plugins.entries['cmtoken'].config.oauth = openclawJson.plugins.entries['cmtoken'].config.oauth || {};
  openclawJson.plugins.entries['cmtoken'].config.oauth.client_id = hostId;
  openclawJson.plugins.entries['cmtoken'].config.oauth.client_secret = pairToken;

  // 写入 providers models 列表
  openclawJson.models = openclawJson.models || {};
  openclawJson.models.providers = openclawJson.models.providers || {};
  openclawJson.models.providers.cmtoken = openclawJson.models.providers.cmtoken || {};
  openclawJson.models.providers.cmtoken.baseUrl = apiBase;
  openclawJson.models.providers.cmtoken.api = 'openai-completions';
  openclawJson.models.providers.cmtoken.models = finalModelsList;

  // 绑定 CMToken 认证到 oauth profile
  openclawJson.auth = openclawJson.auth || {};
  openclawJson.auth.profiles = openclawJson.auth.profiles || {};
  openclawJson.auth.profiles['cmtoken:default'] = {
    provider: 'cmtoken',
    mode: 'oauth'
  };

  // 设置 CMToken 为智能体默认首选模型
  openclawJson.agents = openclawJson.agents || {};
  openclawJson.agents.defaults = openclawJson.agents.defaults || {};
  openclawJson.agents.defaults.models = openclawJson.agents.defaults.models || {};
  openclawJson.agents.defaults.models['cmtoken/' + firstModelId] = {};

  // 配置 Tuken 渠道 (非破坏性合并)
  openclawJson.plugins.entries['tuken'] = openclawJson.plugins.entries['tuken'] || {};
  openclawJson.plugins.entries['tuken'].enabled = true;
  openclawJson.plugins.entries['tuken'].config = openclawJson.plugins.entries['tuken'].config || {};
  openclawJson.plugins.entries['tuken'].config.baseUrl = "$baseUrl";
  openclawJson.plugins.entries['tuken'].config.appId = hostId;
  openclawJson.plugins.entries['tuken'].config.appSecret = pairToken;
  openclawJson.plugins.entries['tuken'].config.instanceId = hostId;

  fs.writeFileSync(openclawJsonPath, JSON.stringify(openclawJson, null, 2), 'utf8');

  // 2. 写入 auth-profiles.json (激活中移 OAuth access + refresh token)
  const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
  let authProfiles = {};
  if (fs.existsSync(authProfilesPath)) {
    try { authProfiles = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8')); } catch(e) {}
  }
  authProfiles.profiles = authProfiles.profiles || {};
  authProfiles.profiles['cmtoken:default'] = {
    type: 'oauth',
    provider: 'cmtoken',
    access: activeAccessToken,
    refresh: deviceToken,
    expires: Date.now() + tokenExpiresIn * 1000
  };
  fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf8');
})().catch(e => {
  console.error('❌ 配对及模型自适应流程执行发生致命异常:', e);
  process.exit(1);
});
"@

$configScriptFile = "$InstallDir\config.js"
$configScript | Out-File -FilePath $configScriptFile -Encoding utf8
& "$nodePath" $configScriptFile
Remove-Item $configScriptFile -Force | Out-Null

log-success "🎉 模型与渠道自动映射配置成功！"

# ── 9. 全自动运行与后台服务注册 ──────────────────────────────────────────────────
log-success "======================================================================"
log-success "🚀 CMToken & Tuken — OpenClaw 自动化部署及实例绑定成功完成！"
log-success "   宿主 ID (Host ID): $hostId"
log-success "======================================================================"

# 清理 staging 暂存区
if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force | Out-Null
}

$serviceRegistered = $false
log-info "正在为您全自动配置并拉起持久化后台守护服务..."

try {
    # 尝试一键安装 Windows 服务/计划任务/启动项并启动
    $null = & "$InstallDir\bin\openclaw.bat" daemon install --force 2>&1
    $null = & "$InstallDir\bin\openclaw.bat" daemon start 2>&1
    $serviceRegistered = $true
} catch {
    $serviceRegistered = $false
}

if ($serviceRegistered) {
    log-success "🎉 成功自动注册为系统自启服务，且已在后台持续稳定运行！"
    log-info "💡 提示：由于网关已作为后台服务独立工作，您可以安全放心关闭当前命令行窗口！"
    log-info "💡 Windows 服务管理常用命令速查："
    log-info "   - 查看服务状态与健康度：  openclaw daemon status"
    log-info "   - 重启网关后台服务：      openclaw daemon restart"
    log-info "   - 停止持久化后台服务：      openclaw daemon stop"
    log-success "======================================================================"
    # 打印最终服务运行状态
    & "$InstallDir\bin\openclaw.bat" daemon status
} else {
    log-warning "自动系统服务注册失败（可能由于权限限制），正在降级前台拉起运行..."
    log-info "💡 提示：前台交互调试模式下，直接关闭当前命令行窗口会导致网关进程退出！"
    log-success "======================================================================"
    & "$InstallDir\bin\openclaw.bat" gateway run
}
