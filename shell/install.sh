#!/usr/bin/env bash
# ==============================================================================
# CMToken & Tuken — OpenClaw Auto-Deploy & Activation Script
# ==============================================================================
#
# Usage:
#   bash install.sh --bot-token ax_b_prod_ivfmI6eKDGpggns8XAxoEQ21Oq4XFi8g [--insecure]
#
# Description:
#   This script automates the full environment installation from an offline pack
#   (openclaw.install.tgz), exchanges the Temp Token for CMToken credentials,
#   and establishes zero-configuration pairing with Tuken-Hub.
#
# ==============================================================================

# ==============================================================================
# 1. 核心配置变量 (Core Configuration Variables)
# ==============================================================================
# 兔啃部署换券接口地址 (Deploy exchange endpoint URL, empty by default)
DEPLOY_EXCHANGE_URL="${DEPLOY_EXCHANGE_URL:-}"
# 离线部署包下载地址 (Offline install package download URL, empty by default for platform dynamic resolution)
OFFLINE_PACK_URL="${OFFLINE_PACK_URL:-}"
# ==============================================================================

# 样式与颜色定义 (Terminal styles and colors)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "======================================================================="
echo "       兔啃 (Tuken) & CMToken 智能助手自动化部署激活系统"
echo "======================================================================="
echo -e "${NC}"

# 打印日志辅助函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}
log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}
log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}
log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ── 1. 参数解析 ──────────────────────────────────────────────────────────────
TEMP_TOKEN=""
INSTALL_DIR="$HOME/.openclaw-app"
INSECURE_CURL=""

while [ "$#" -gt 0 ]; do
    case $1 in
        --bot-token)
            TEMP_TOKEN="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --exchange-url)
            DEPLOY_EXCHANGE_URL="$2"
            shift 2
            ;;
        --pack-url)
            OFFLINE_PACK_URL="$2"
            shift 2
            ;;
        -k|--insecure)
            INSECURE_CURL="-k"
            export NODE_TLS_REJECT_UNAUTHORIZED=0
            shift
            ;;
        *)
            log_warning "未知参数: $1"
            shift
            ;;
    esac
done

if [ -z "$TEMP_TOKEN" ]; then
    log_error "缺少必需参数 --bot-token (temp_token)"
    echo "使用示例:"
    echo "  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL>"
    exit 1
fi

if [ -z "$DEPLOY_EXCHANGE_URL" ]; then
    log_error "缺少必需参数 --exchange-url (部署换券接口地址)"
    echo "使用示例:"
    echo "  bash install.sh --bot-token <YOUR_TEMP_TOKEN> --exchange-url <EXCHANGE_URL>"
    exit 1
fi

# ── 1.5 证书安全性与 HTTPS 旁路自检 ───────────────────────────────────────────
if [ -z "$INSECURE_CURL" ]; then
    log_info "正在进行 HTTPS 证书链路与网络连通性测试..."
    # 尝试无校验探测，设置 5 秒超时
    TEST_CONNECT=$(curl -sI --max-time 5 "${DEPLOY_EXCHANGE_URL}" 2>&1)
    CURL_STATUS=$?
    
    # 常见的 SSL/TLS 错误退出码:
    # 35: SSL connect error
    # 51: SSL peer certificate was not OK
    # 60: SSL certificate problem: self signed certificate
    # 83: SSL issuer certificate lookup failed
    IS_SSL_ERROR=false
    if [ $CURL_STATUS -eq 60 ] || [ $CURL_STATUS -eq 51 ] || [ $CURL_STATUS -eq 35 ] || [ $CURL_STATUS -eq 83 ]; then
        IS_SSL_ERROR=true
    elif echo "$TEST_CONNECT" | grep -E -q -i "certificate|SSL|self-signed|expired"; then
        IS_SSL_ERROR=true
    fi

    if [ "$IS_SSL_ERROR" = true ]; then
        INSECURE_CURL="-k"
        export NODE_TLS_REJECT_UNAUTHORIZED=0
        log_warning "⚠️ 自检发现当前网络存在 HTTPS 证书信任问题 (如自签名证书、专网安全拦截或证书过期)。"
        log_warning "   已自动为您激活 Insecure 安全旁路模式（忽略 TLS/SSL 校验），确保后续流畅下载与请求！"
    else
        log_success "HTTPS 链路证书校验正常，采用标准加密握手。"
    fi
else
    log_warning "用户手动指定了安全旁路模式 (Insecure Mode)，跳过证书校验！"
fi

log_info "部署换券地址: ${DEPLOY_EXCHANGE_URL}"
if [ -n "$OFFLINE_PACK_URL" ]; then
    log_info "离线包下载源前缀: ${OFFLINE_PACK_URL}"
else
    log_info "离线包下载源前缀: [未指定前缀，优先寻找本地/同级目录的离线包]"
fi
log_info "安装目标路径: ${INSTALL_DIR}"

# ── 2. 平台检测 ──────────────────────────────────────────────────────────────
OS_TYPE="$(uname -s)"
log_info "正在检测运行平台: ${OS_TYPE}"

IS_WINDOWS=false
case "$OS_TYPE" in
    *MONG*|*NT*|*MIN*|*MSYS*)
        IS_WINDOWS=true
        log_info "检测到当前为 Windows 操作系统 (Git Bash / MSYS)"
        ;;
esac

# ── 2.5 系统基础工具依赖自检与自动安装 (curl, tar, unzip) ───────────────────────
if [ "$IS_WINDOWS" = false ]; then
    log_info "正在执行系统基础工具依赖自检 (curl, tar, unzip)..."
    MISSING_DEPS=""
    for cmd in curl tar unzip; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            if [ -z "$MISSING_DEPS" ]; then
                MISSING_DEPS="$cmd"
            else
                MISSING_DEPS="$MISSING_DEPS $cmd"
            fi
        fi
    done

    if [ -n "$MISSING_DEPS" ]; then
        log_warning "检测到系统缺失以下必要工具: $MISSING_DEPS"
        log_info "正在尝试为您自动下载并安装缺失依赖..."
        if command -v apt-get >/dev/null 2>&1; then
            log_info "检测到 Debian/Ubuntu 平台，使用 apt-get 进行安装..."
            sudo apt-get update -qq
            sudo apt-get install -y $MISSING_DEPS
        elif command -v yum >/dev/null 2>&1; then
            log_info "检测到 CentOS/RHEL 平台，使用 yum 进行安装..."
            sudo yum install -y $MISSING_DEPS
        elif command -v dnf >/dev/null 2>&1; then
            log_info "检测到 Fedora 平台，使用 dnf 进行安装..."
            sudo dnf install -y $MISSING_DEPS
        elif command -v brew >/dev/null 2>&1; then
            log_info "检测到 macOS 平台，使用 Homebrew 进行安装..."
            brew install $MISSING_DEPS
        else
            log_error "未检测到支持的系统包管理器，请手动安装缺失依赖: $MISSING_DEPS"
            exit 1
        fi

        # 再次验证
        RE_CHECK_FAIL=false
        for cmd in $MISSING_DEPS; do
            if ! command -v "$cmd" >/dev/null 2>&1; then
                RE_CHECK_FAIL=true
            fi
        done

        if [ "$RE_CHECK_FAIL" = true ]; then
            log_error "系统依赖自动安装失败，请手动安装缺失依赖后重试: $MISSING_DEPS"
            exit 1
        else
            log_success "所有系统基础工具依赖已成功自动安装！"
        fi
    else
        log_success "系统基础工具自检通过 (curl, tar, unzip 均已就绪)。"
    fi
fi

# ── 3. 离线包下载与提取流程 ───────────────────────────────────────────────────
PLATFORM_SUFFIX="linux"
if [ "$IS_WINDOWS" = true ]; then
    PLATFORM_SUFFIX="win"
elif [ "$OS_TYPE" = "Darwin" ]; then
    PLATFORM_SUFFIX="mac"
fi

OFFLINE_FILE="openclaw.install.${PLATFORM_SUFFIX}.tgz"
GENERIC_FILE="openclaw.install.tgz"
STAGING_DIR="$INSTALL_DIR/staging"
mkdir -p "$INSTALL_DIR"

IS_PLUGIN_ONLY=false

# 检查系统是否已具备全局/工作区 OpenClaw
GLOBAL_OPENCLAW_OK=false
if command -v openclaw >/dev/null 2>&1; then
    GLOBAL_OPENCLAW_OK=true
elif [ -f "../../openclaw/package.json" ]; then
    GLOBAL_OPENCLAW_OK=true
fi

# 检查本地是否有任何离线大包
HAS_OFFLINE_PACKAGE=false
if [ -f "./$OFFLINE_FILE" ] || [ -f "./$GENERIC_FILE" ] || [ -f "$OFFLINE_FILE" ] || [ -f "$GENERIC_FILE" ]; then
    HAS_OFFLINE_PACKAGE=true
fi

if [ "$GLOBAL_OPENCLAW_OK" = true ] && [ "$HAS_OFFLINE_PACKAGE" = false ]; then
    IS_PLUGIN_ONLY=true
    log_success "检测到系统已具备全局/工作区 OpenClaw 服务，且本地无离线部署大包。"
    log_info "🚀 将自动进入【极轻量级插件独立安装模式】！无需下载庞大的平台运行底座。"
fi

if [ "$IS_PLUGIN_ONLY" = true ]; then
    log_info "正在为您定位并拉取插件程序包..."
    CMTOKEN_TGZ=""
    TUKEN_TGZ=""

    # 1. 优先从同级目录寻找已编译好的插件
    if [ -f "./cmtoken-v1.0.0-prod.tgz" ]; then
        CMTOKEN_TGZ="$(pwd)/cmtoken-v1.0.0-prod.tgz"
        log_success "找到本地已编译 CMToken 插件: $CMTOKEN_TGZ"
    elif [ -f "cmtoken-v1.0.0-prod.tgz" ]; then
        CMTOKEN_TGZ="$(pwd)/cmtoken-v1.0.0-prod.tgz"
        log_success "找到本地已编译 CMToken 插件: $CMTOKEN_TGZ"
    fi

    if [ -f "./tuken-v0.6.0.tgz" ]; then
        TUKEN_TGZ="$(pwd)/tuken-v0.6.0.tgz"
        log_success "找到本地已编译 Tuken 渠道插件: $TUKEN_TGZ"
    elif [ -f "tuken-v0.6.0.tgz" ]; then
        TUKEN_TGZ="$(pwd)/tuken-v0.6.0.tgz"
        log_success "找到本地已编译 Tuken 渠道插件: $TUKEN_TGZ"
    fi

    # 2. 如果本地没有，且配置了下载前缀，则在线拉取这两个轻量插件
    if [ -z "$CMTOKEN_TGZ" ] || [ -z "$TUKEN_TGZ" ]; then
        if [ -z "$OFFLINE_PACK_URL" ]; then
            log_error "未在本地找到插件文件，且缺少 --pack-url 下载前缀配置！"
            exit 1
        fi
        
        # 动态去除末尾斜杠和可能携带的文件名后缀
        PACK_PREFIX=$(echo "$OFFLINE_PACK_URL" | sed 's/\/$//' | sed 's/openclaw.install.*.tgz//g' | sed 's/openclaw.install.tgz//g' | sed 's/\/$//')
        mkdir -p "$INSTALL_DIR"

        if [ -z "$CMTOKEN_TGZ" ]; then
            log_info "正在在线拉取轻量级 CMToken 插件..."
            curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/cmtoken-v1.0.0-prod.tgz" "${PACK_PREFIX}/cmtoken-v1.0.0-prod.tgz"
            if [ -f "$INSTALL_DIR/cmtoken-v1.0.0-prod.tgz" ] && [ -s "$INSTALL_DIR/cmtoken-v1.0.0-prod.tgz" ]; then
                CMTOKEN_TGZ="$INSTALL_DIR/cmtoken-v1.0.0-prod.tgz"
                log_success "CMToken 插件拉取成功！"
            else
                log_error "CMToken 插件在线拉取失败，请检查下载源前缀配置！"
                exit 1
            fi
        fi

        if [ -z "$TUKEN_TGZ" ]; then
            log_info "正在在线拉取轻量级 Tuken 渠道插件..."
            curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/tuken-v0.6.0.tgz" "${PACK_PREFIX}/tuken-v0.6.0.tgz"
            if [ -f "$INSTALL_DIR/tuken-v0.6.0.tgz" ] && [ -s "$INSTALL_DIR/tuken-v0.6.0.tgz" ]; then
                TUKEN_TGZ="$INSTALL_DIR/tuken-v0.6.0.tgz"
                log_success "Tuken 渠道插件拉取成功！"
            else
                log_error "Tuken 渠道插件在线拉取失败，请检查下载源前缀配置！"
                exit 1
            fi
        fi
    fi
else
    # ── 这里是原来的大包下载、提取、解压流程 ─────────────────────────────────────
    OFFLINE_FILE_PATH=""

    # 优先级1: 同级平台专属包
    if [ -f "./$OFFLINE_FILE" ]; then
        log_success "检测到同级存在平台专属离线包: ./$OFFLINE_FILE，跳过下载。"
        OFFLINE_FILE_PATH="$(pwd)/$OFFLINE_FILE"
    # 优先级2: 同级通用包
    elif [ -f "./$GENERIC_FILE" ]; then
        log_success "检测到同级存在通用离线包: ./$GENERIC_FILE，跳过下载。"
        OFFLINE_FILE_PATH="$(pwd)/$GENERIC_FILE"
    # 优先级3: 当前工作路径专属包
    elif [ -f "$OFFLINE_FILE" ]; then
        log_success "检测到本地存在平台专属离线包: $OFFLINE_FILE，跳过下载。"
        OFFLINE_FILE_PATH="$(pwd)/$OFFLINE_FILE"
    # 优先级4: 当前工作路径通用包
    elif [ -f "$GENERIC_FILE" ]; then
        log_success "检测到本地存在通用离线包: $GENERIC_FILE，跳过下载。"
        OFFLINE_FILE_PATH="$(pwd)/$GENERIC_FILE"
    else
        # 在线下载模式：没有本地文件，必须配置离线大包下载源前缀
        if [ -z "$OFFLINE_PACK_URL" ]; then
            log_error "缺少离线安装大包下载源前缀配置 OFFLINE_PACK_URL！"
            log_error "在线部署模式下，请通过参数 --pack-url <URL_PREFIX> 指定下载源前缀（如：http://intranet.local/packages）。"
            exit 1
        fi

        # 动态去除前缀末尾的斜杠，并自动拼接平台专属文件名
        PACK_PREFIX=$(echo "$OFFLINE_PACK_URL" | sed 's/\/$//')
        
        # 智能检查：如果用户传入的前缀末尾已经带了具体的 .tgz 文件，则用 sed 将其重写为对应平台的专属包名
        case "$PACK_PREFIX" in
            *.tgz)
                case "$PACK_PREFIX" in
                    *openclaw.install.tgz)
                        DOWNLOAD_URL=$(echo "$PACK_PREFIX" | sed "s/openclaw.install.tgz/openclaw.install.${PLATFORM_SUFFIX}.tgz/g")
                        ;;
                    *)
                        DOWNLOAD_URL="$PACK_PREFIX"
                        ;;
                esac
                ;;
            *)
                DOWNLOAD_URL="${PACK_PREFIX}/openclaw.install.${PLATFORM_SUFFIX}.tgz"
                ;;
        esac

        log_info "未检测到本地离线部署包，正在发起智能平台专属下载..."
        log_info "下载源 URL: ${DOWNLOAD_URL}"
        curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/$OFFLINE_FILE" "${DOWNLOAD_URL}"
        if [ ! -f "$INSTALL_DIR/$OFFLINE_FILE" ] || [ ! -s "$INSTALL_DIR/$OFFLINE_FILE" ]; then
            log_error "离线部署包下载失败，请检查网络或配置的下载源前缀地址！"
            exit 1
        fi
        OFFLINE_FILE_PATH="$INSTALL_DIR/$OFFLINE_FILE"
        log_success "离线包下载成功！路径: $OFFLINE_FILE_PATH"
    fi

    log_info "正在解压离线包至暂存区..."
    rm -rf "$STAGING_DIR" && mkdir -p "$STAGING_DIR"
    tar -xzf "$OFFLINE_FILE_PATH" -C "$STAGING_DIR"
    log_success "离线包提取完成！"
fi

# ── 4. 环境与依赖部署 (全离线检测/装载) ─────────────────────────────────────────

# 4.1 部署 Node.js 环境
NODE_OK=false
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v | tr -d 'v')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        NODE_OK=true
        log_success "系统已具备兼容的 Node.js: $(node -v)"
    fi
fi

if [ "$NODE_OK" = false ]; then
    log_info "正在从离线包暂存区寻找 Node.js 绿色版..."
    NODE_ARCHIVE=$(find "$STAGING_DIR" -name "*node-v22*" -o -name "*node-v20*" -name "*.zip" -o -name "*.tar.gz" -o -name "*.tar.xz" | head -n 1)
    if [ -n "$NODE_ARCHIVE" ]; then
        log_info "在离线包中找到 Node.js 绿色安装包: $NODE_ARCHIVE"
        mkdir -p "$INSTALL_DIR/node-portable"
        if [[ "$NODE_ARCHIVE" == *.zip ]]; then
            unzip -q "$NODE_ARCHIVE" -d "$INSTALL_DIR/node-portable"
        else
            tar -xf "$NODE_ARCHIVE" -C "$INSTALL_DIR/node-portable" --strip-components=1
        fi
        export PATH="$INSTALL_DIR/node-portable/bin:$INSTALL_DIR/node-portable:$PATH"
        if command -v node >/dev/null 2>&1; then
            log_success "离线 Node.js 绿色版装载成功: $(node -v)"
            NODE_OK=true
        fi
    fi
fi

if [ "$NODE_OK" = false ]; then
    # 兜底在线下载
    log_warning "未能在离线包中匹配到 Node.js，正在尝试在线动态拉取绿色版..."
    mkdir -p "$INSTALL_DIR/node-portable"
    if [ "$IS_WINDOWS" = true ]; then
        NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip"
        curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/node.zip" "$NODE_URL"
        unzip -q "$INSTALL_DIR/node.zip" -d "$INSTALL_DIR/node-portable-temp"
        mv "$INSTALL_DIR/node-portable-temp"/node-v22.11.0-win-x64/* "$INSTALL_DIR/node-portable/"
        rm -rf "$INSTALL_DIR/node-portable-temp" "$INSTALL_DIR/node.zip"
        export PATH="$INSTALL_DIR/node-portable:$PATH"
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-x64.tar.gz"
        curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/node.tar.gz" "$NODE_URL"
        tar -xzf "$INSTALL_DIR/node.tar.gz" -C "$INSTALL_DIR/node-portable" --strip-components=1
        rm "$INSTALL_DIR/node.tar.gz"
        export PATH="$INSTALL_DIR/node-portable/bin:$PATH"
    else
        NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz"
        curl ${INSECURE_CURL} -L -o "$INSTALL_DIR/node.tar.xz" "$NODE_URL"
        tar -xJf "$INSTALL_DIR/node.tar.xz" -C "$INSTALL_DIR/node-portable" --strip-components=1
        rm "$INSTALL_DIR/node.tar.xz"
        export PATH="$INSTALL_DIR/node-portable/bin:$PATH"
    fi
    
    if command -v node >/dev/null 2>&1; then
        log_success "在线绿色版 Node.js 装载成功: $(node -v)"
        NODE_OK=true
    fi
fi

# 4.2 部署 Git 依赖
GIT_OK=false
if command -v git >/dev/null 2>&1; then
    GIT_OK=true
    log_success "系统已具备兼容的 Git: $(git --version)"
fi

if [ "$GIT_OK" = false ]; then
    log_info "正在从离线包暂存区寻找 Git 绿色版..."
    GIT_ARCHIVE=$(find "$STAGING_DIR" -name "*git*" -name "*.zip" -o -name "*.7z" -o -name "*.tar.gz" | head -n 1)
    if [ -n "$GIT_ARCHIVE" ]; then
        log_info "在离线包中找到 Git 安装包: $GIT_ARCHIVE"
        mkdir -p "$INSTALL_DIR/git-portable"
        if [[ "$GIT_ARCHIVE" == *.zip ]]; then
            unzip -q "$GIT_ARCHIVE" -d "$INSTALL_DIR/git-portable"
        else
            tar -xf "$GIT_ARCHIVE" -C "$INSTALL_DIR/git-portable" --strip-components=1
        fi
        export PATH="$INSTALL_DIR/git-portable/bin:$INSTALL_DIR/git-portable/cmd:$INSTALL_DIR/git-portable:$PATH"
        if command -v git >/dev/null 2>&1; then
            log_success "离线 Git 绿色版装载成功: $(git --version)"
            GIT_OK=true
        fi
    fi
fi

if [ "$GIT_OK" = false ] && [ "$IS_WINDOWS" = false ]; then
    log_error "部署需要 Git 环境，请先安装 Git 客户端！"
    exit 1
fi

# 4.3 部署 OpenClaw 核心程序
OPENCLAW_PATH=""
if [ "$IS_PLUGIN_ONLY" = true ]; then
    if command -v openclaw >/dev/null 2>&1; then
        OPENCLAW_PATH="openclaw"
    elif [ -f "../../openclaw/package.json" ]; then
        OPENCLAW_PATH="node $(pwd)/../../openclaw/openclaw.mjs"
    fi
    log_success "极简模式：直接重用已存在的 OpenClaw CLI ($OPENCLAW_PATH)"
else
    if command -v openclaw >/dev/null 2>&1; then
        OPENCLAW_PATH="openclaw"
        log_success "检测到全局 OpenClaw CLI"
    elif [ -f "../../openclaw/package.json" ]; then
        OPENCLAW_PATH="node $(pwd)/../../openclaw/openclaw.mjs"
        log_success "检测到开发级工作区级 OpenClaw: $OPENCLAW_PATH"
    else
        log_info "准备安装 OpenClaw 核心程序..."
        # 优先在离线暂存区寻找 openclaw 目录或源压缩包
        OPENCLAW_SOURCE=$(find "$STAGING_DIR" -maxdepth 2 -type d -name "openclaw" -o -name "openclaw-core" | head -n 1)
        if [ -z "$OPENCLAW_SOURCE" ]; then
            OPENCLAW_ZIP=$(find "$STAGING_DIR" -name "*openclaw*.zip" -o -name "*openclaw*.tar.gz" -o -name "*openclaw*.tgz" | grep -v "cmtoken" | grep -v "tuken" | head -n 1)
            if [ -n "$OPENCLAW_ZIP" ]; then
                log_info "在离线包中发现 OpenClaw 源码压缩包: $OPENCLAW_ZIP"
                mkdir -p "$INSTALL_DIR/openclaw-core"
                if [[ "$OPENCLAW_ZIP" == *.zip ]]; then
                    unzip -q "$OPENCLAW_ZIP" -d "$INSTALL_DIR/openclaw-core"
                else
                    tar -xf "$OPENCLAW_ZIP" -C "$INSTALL_DIR/openclaw-core" --strip-components=1
                fi
                OPENCLAW_SOURCE="$INSTALL_DIR/openclaw-core"
            fi
        fi
        
        if [ -n "$OPENCLAW_SOURCE" ] && [ -d "$OPENCLAW_SOURCE" ]; then
            log_info "正在部署离线 OpenClaw 至应用目录..."
            if [ "$OPENCLAW_SOURCE" != "$INSTALL_DIR/openclaw-core" ]; then
                mkdir -p "$INSTALL_DIR"
                cp -rf "$OPENCLAW_SOURCE" "$INSTALL_DIR/openclaw-core"
            fi
            cd "$INSTALL_DIR/openclaw-core" || exit 1
            log_info "正在安装 OpenClaw 依赖模块..."
            npm install --omit=dev --no-audit --no-fund
            cd - >/dev/null || exit 1
            log_success "离线 OpenClaw 核心模块就绪！"
        else
            # 在线克隆兜底
            log_warning "未发现离线 OpenClaw 核心，启动在线 Git 克隆部署..."
            mkdir -p "$INSTALL_DIR"
            git clone --depth 1 https://github.com/openclaw/openclaw.git "$INSTALL_DIR/openclaw-core"
            cd "$INSTALL_DIR/openclaw-core" || exit 1
            npm install --omit=dev --no-audit --no-fund
            cd - >/dev/null || exit 1
            log_success "在线 OpenClaw 核心模块就绪！"
        fi

        # ── 4.4 部署 Linux/macOS 绿色命令行包装器 ─────────────────────────────────────────
        log_info "正在为当前绿色安装环境创建 'openclaw' 命令行包装器..."
        BIN_DIR="$INSTALL_DIR/bin"
        mkdir -p "$BIN_DIR"
        
        # 写入包装器脚本，硬编码真实的 Node 及核心路径，实现绿色且随处可用
        cat << 'EOF' > "$BIN_DIR/openclaw"
#!/bin/sh
# CMToken & Tuken — Green OpenClaw Portable CLI Wrapper
INSTALL_DIR_PLACEHOLDER

# 保证当前进程执行环境优先使用绿色 Node
export PATH="INSTALL_DIR_PLACEHOLDER/node-portable/bin:$PATH"

exec "INSTALL_DIR_PLACEHOLDER/node-portable/bin/node" "INSTALL_DIR_PLACEHOLDER/openclaw-core/dist/cli/index.js" "$@"
EOF

        # 替换绝对路径占位符并赋予执行权限
        sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$BIN_DIR/openclaw" 2>/dev/null || sed -i "" "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$BIN_DIR/openclaw"
        chmod +x "$BIN_DIR/openclaw"

        # 自动将包装器所在的 bin 目录追加到当前用户的 shell 配置文件中，实现原生“全局使用 openclaw”命令
        SHELL_RC=""
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            SHELL_RC="$HOME/.zshrc"
        elif [ -f "$HOME/.bash_profile" ]; then
            SHELL_RC="$HOME/.bash_profile"
        elif [ -f "$HOME/.profile" ]; then
            SHELL_RC="$HOME/.profile"
        fi

        if [ -n "$SHELL_RC" ]; then
            if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
                echo "" >> "$SHELL_RC"
                echo "# CMToken & Tuken — OpenClaw Portable CLI PATH" >> "$SHELL_RC"
                echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$SHELL_RC"
                log_success "已将 openclaw 绿色命令行路径追加到 $SHELL_RC 中！"
            else
                log_success "$SHELL_RC 中已包含 openclaw 路径配置。"
            fi
        fi

        OPENCLAW_PATH="$BIN_DIR/openclaw"
    fi
fi

# ── 5. 生成或读取本机唯一实例标识 (Host ID) ──────────────────────────────────────
HOST_ID=""
mkdir -p "$HOME/.openclaw"
if [ -f "$HOME/.openclaw/host_id" ]; then
    HOST_ID=$(cat "$HOME/.openclaw/host_id" | tr -d '[:space:]')
    log_info "读取到本机持久化 Host ID: ${HOST_ID}"
else
    # 生成一个新的 Host ID
    if command -v uuidgen >/dev/null 2>&1; then
        HOST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    else
        RAND_HASH=$(node -e "console.log(require('crypto').randomUUID())" 2>/dev/null)
        if [ -n "$RAND_HASH" ]; then
            HOST_ID="$RAND_HASH"
        else
            RAND_HASH=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 32 | head -n 1)
            HOST_ID="${RAND_HASH:0:8}-${RAND_HASH:8:4}-${RAND_HASH:12:4}-${RAND_HASH:16:4}-${RAND_HASH:20:12}"
        fi
    fi
    echo "$HOST_ID" > "$HOME/.openclaw/host_id"
    log_success "成功为本机生成唯一 Host ID: ${HOST_ID}"
fi

# ── 6. 执行 POST 请求换券 (Token Exchange) ───────────────────────────────────
log_info "正在向兔啃平台发起换券校验请求..."

HOST_NAME="$(hostname || echo 'unknown-host')"
OS_INFO="$(uname -s -r || echo 'unknown-os')"
CLIENT_VERSION="v1.0.0"

JSON_BODY=$(cat <<EOF
{
  "temp_token": "${TEMP_TOKEN}",
  "host_id": "${HOST_ID}",
  "host_name": "${HOST_NAME}",
  "client_version": "${CLIENT_VERSION}",
  "os": "${OS_INFO}"
}
EOF
)

log_info "提交载荷: ${JSON_BODY}"

RESPONSE=$(curl ${INSECURE_CURL} -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$JSON_BODY" \
  "${DEPLOY_EXCHANGE_URL}")

if [ -z "$RESPONSE" ]; then
    log_error "向换券服务请求失败，无响应返回！"
    exit 1
fi

log_info "服务端响应: ${RESPONSE}"

# 校验并提取响应参数
CODE=$(node -e "
try {
  const r = ${RESPONSE};
  console.log(r.code || r.status || '');
} catch(e) {
  console.log('parse_error');
}
")

if [ "$CODE" != "200" ] && [ "$CODE" != "success" ]; then
    MSG=$(node -e "try { console.log((${RESPONSE}).msg || (${RESPONSE}).message || '未知错误'); } catch(e) {}")
    log_error "激活换券失败！状态码: ${CODE}, 原因: ${MSG}"
    exit 1
fi

log_success "🎉 令牌换券成功，已授权该实例！"

# 提取关键凭证与配置
DEVICE_TOKEN=$(node -e "console.log((${RESPONSE}).data?.device_token || '')")
EXPIRES_IN=$(node -e "console.log((${RESPONSE}).data?.expires_in || 7200)")
PAIR_TOKEN=$(node -e "console.log((${RESPONSE}).data?.pair_token || '')")
API_BASE=$(node -e "console.log((${RESPONSE}).data?.api_base || '')")

if [ -z "$DEVICE_TOKEN" ] || [ -z "$PAIR_TOKEN" ]; then
    log_error "响应凭证不完整，缺少 device_token 或 pair_token。"
    exit 1
fi

# ── 7. 安装 CMToken 与 Tuken 插件 ───────────────────────────────────────────
log_info "开始定位插件并执行安全安装..."

if [ "$IS_PLUGIN_ONLY" = false ]; then
    CMTOKEN_TGZ=$(find "$STAGING_DIR" -name "*cmtoken*.tgz" | head -n 1)
    TUKEN_TGZ=$(find "$STAGING_DIR" -name "*tuken*.tgz" | head -n 1)
fi

if [ -n "$CMTOKEN_TGZ" ] && [ -f "$CMTOKEN_TGZ" ]; then
    log_info "正在安装 CMToken 插件: $CMTOKEN_TGZ"
    $OPENCLAW_PATH plugins install "$CMTOKEN_TGZ" --dangerously-force-unsafe-install
else
    log_error "未找到 CMToken 插件安装包，安装流程中断！"
    exit 1
fi

if [ -n "$TUKEN_TGZ" ] && [ -f "$TUKEN_TGZ" ]; then
    log_info "正在安装 Tuken 渠道插件: $TUKEN_TGZ"
    $OPENCLAW_PATH plugins install "$TUKEN_TGZ" --dangerously-force-unsafe-install
else
    log_error "未找到 Tuken 渠道插件安装包，安装流程中断！"
    exit 1
fi

# ── 8. 走 CMToken 模型自动配置和渠道自动配对流程 ──────────────────────────────
log_info "正在写入零配置系统配对数据..."

# 运行 Node.js 脚本来进行精准的 JSON 更新，以绝对安全的方式修改 openclaw.json 和 auth-profiles.json
node -e "
const fs = require('fs');
const path = require('path');

const homeDir = process.env.HOME || process.env.USERPROFILE;

// 1. 更新 openclaw.json
const openclawJsonPath = path.join(homeDir, '.openclaw', 'openclaw.json');
let config = {};
if (fs.existsSync(openclawJsonPath)) {
  try {
    config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
  } catch (e) {
    console.warn('⚠️ 现有 openclaw.json 格式异常，将覆盖');
  }
}

config.plugins = config.plugins || {};
config.plugins.entries = config.plugins.entries || {};

// 开启 CMToken 插件
config.plugins.entries.cmtoken = config.plugins.entries.cmtoken || {};
config.plugins.entries.cmtoken.enabled = true;
config.plugins.entries.cmtoken.config = config.plugins.entries.cmtoken.config || {};
if ('$API_BASE') {
  config.plugins.entries.cmtoken.config.baseUrl = '$API_BASE';
}

// 绑定 CMToken 认证到 oauth profile
config.auth = config.auth || {};
config.auth.profiles = config.auth.profiles || {};
config.auth.profiles['cmtoken:default'] = {
  provider: 'cmtoken',
  mode: 'oauth'
};

// 设置 CMToken 为智能体默认首选模型
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.models = config.agents.defaults.models || {};
config.agents.defaults.models['cmtoken/minmax'] = {};

// 开启并自动配对 Tuken 渠道
config.plugins.entries.tuken = config.plugins.entries.tuken || {};
config.plugins.entries.tuken.enabled = true;

// 自动填充渠道参数实现配对
config.channels = config.channels || {};
config.channels.tuken = config.channels.tuken || {};
config.channels.tuken.enabled = true;

// 从部署接口地址推导 兔啃 渠道连接的 baseUrl
let hubBaseUrl = '';
try {
  const u = new URL('$DEPLOY_EXCHANGE_URL');
  hubBaseUrl = u.origin + u.pathname.substring(0, u.pathname.lastIndexOf('/deploy/exchange'));
} catch (e) {}

config.channels.tuken.baseUrl = hubBaseUrl || 'http://127.0.0.1:8787';
config.channels.tuken.appId = '$HOST_ID';
config.channels.tuken.appSecret = '$PAIR_TOKEN';
config.channels.tuken.openclawInstanceId = '$HOST_ID';
config.channels.tuken.pollTimeoutMs = 1000;
config.channels.tuken.heartbeatIntervalMs = 15000;

fs.mkdirSync(path.dirname(openclawJsonPath), { recursive: true });
fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf8');
console.log('✅ [openclaw.json] 自动化模型与渠道配对参数更新完成！');

// 2. 更新 auth-profiles.json (激活移动认证 Refresh Token)
const authProfilesPath = path.join(homeDir, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
let authProfiles = { profiles: {} };
if (fs.existsSync(authProfilesPath)) {
  try {
    authProfiles = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
  } catch (e) {}
}

authProfiles.profiles = authProfiles.profiles || {};
authProfiles.profiles['cmtoken:default'] = {
  type: 'oauth',
  provider: 'cmtoken',
  access: 'initial_activation_token',
  refresh: '$DEVICE_TOKEN',
  expires: Date.now() + parseInt('$EXPIRES_IN') * 1000
};

fs.mkdirSync(path.dirname(authProfilesPath), { recursive: true });
fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf8');
console.log('✅ [auth-profiles.json] 移动端换券 Refresh Token 设备激活写入完成！');
"

# 清理暂存区
rm -rf "$STAGING_DIR"

# ── 9. 完成激活与全自动运行提示 ──────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}"
echo "======================================================================="
echo " 🎉 兔啃 (Tuken) 客户端实例部署激活与自动配对已圆满完成！"
echo "======================================================================="
echo -e "${NC}"
echo -e "本机唯一实例标识 (Host ID / appId): ${YELLOW}${HOST_ID}${NC}"
echo -e "当前已自动建立与中移认证中心的代理换券通路并配对至 Tuken Hub。"
echo ""

# 尝试自动安装并拉起系统后台守护服务
SERVICE_REGISTERED=false
log_info "正在为您全自动配置并拉起持久化后台守护服务..."

if [ "$(id -u)" -eq 0 ]; then
    log_info "正在以 root 身份注册系统守护服务..."
    if $OPENCLAW_PATH daemon install --force >/dev/null 2>&1 && $OPENCLAW_PATH daemon start >/dev/null 2>&1; then
        SERVICE_REGISTERED=true
    fi
elif command -v sudo >/dev/null 2>&1; then
    log_info "检测到非 root 用户，正在使用 sudo 提权注册系统守护服务 (可能需要您输入密码)..."
    if sudo $OPENCLAW_PATH daemon install --force >/dev/null 2>&1 && sudo $OPENCLAW_PATH daemon start >/dev/null 2>&1; then
        SERVICE_REGISTERED=true
    fi
fi

if [ "$SERVICE_REGISTERED" = true ]; then
    log_success "🎉 成功自动注册为系统后台服务，且已在后台持续稳定运行！"
    echo -e "💡 ${GREEN}提示：由于已作为系统守护进程运行，您可以安全关闭此终端，网关将开机自启并默默为您守护！${NC}"
    echo -e "💡 ${YELLOW}服务管理常用命令速查：${NC}"
    echo -e "   - 查看服务状态与健康度： ${BOLD}openclaw daemon status${NC}"
    echo -e "   - 重启网关后台服务：     ${BOLD}openclaw daemon restart${NC}"
    echo -e "   - 停止持久化后台服务：     ${BOLD}openclaw daemon stop${NC}"
    echo "-----------------------------------------------------------------------"
    echo ""
    # 打印最终服务运行状态
    $OPENCLAW_PATH daemon status
else
    log_warning "未能自动注册系统后台服务（可能由于权限限制或无 sudo），正在降级前台拉起运行..."
    echo -e "💡 ${YELLOW}提示：前台调试模式下，直接关闭当前终端窗口会导致网关进程退出！${NC}"
    echo "-----------------------------------------------------------------------"
    echo ""
    $OPENCLAW_PATH gateway run
fi
