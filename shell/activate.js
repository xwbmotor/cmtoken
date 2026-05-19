#!/usr/bin/env node
/**
 * CMToken & Tuken — Standalone Deployment Activation & Autoconfiguration Script
 *
 * This script is called by install.sh / install.ps1 to perform:
 * 1. Secure deployment token exchange (TICKET -> Refresh Token & Pair Token).
 * 2. Active Access Token exchange & MaaS dynamic models discovery.
 * 3. Non-destructive Deep Merge of openclaw.json and auth-profiles.json.
 *
 * Zero-dependency CommonJS script ensuring maximum runtime compatibility.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse CLI arguments
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = process.argv[i + 1];
    if (val && !val.startsWith('--')) {
      args[key] = val;
      i++;
    } else {
      args[key] = true;
    }
  }
}

const hostId = args['host-id'];
const tempToken = args['temp-token'];
const exchangeUrl = 'http://maas.gd.chinamobile.com:36007/ai/uifm/open/v1/deploy/exchange';
const customOauthUrl = 'https://agentlink.idaas.cmpassport.com/oauth2-service';
const isInsecure = args['insecure'] === 'true' || args['insecure'] === true;

if (!hostId || !tempToken) {
  console.error('❌ 激活失败：缺少必需参数 (--host-id, --temp-token)');
  process.exit(1);
}

if (isInsecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️  已开启 Insecure 安全旁路模式，忽略 TLS/SSL 证书校验。');
}

(async () => {
  console.log('📡 正在向部署服务器请求激活授权换券...');
  
  // 1. 发起部署换券请求
  let exchangeRes;
  try {
    exchangeRes = await fetch(exchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        temp_token: tempToken,
        host_id: hostId
      })
    });
  } catch (err) {
    console.error('❌ 网络连接异常，无法连接至部署服务器:', err.message);
    process.exit(1);
  }

  if (!exchangeRes.ok) {
    console.error(`❌ 换券请求失败，HTTP 状态码: ${exchangeRes.status}`);
    process.exit(1);
  }

  const exchangeData = await exchangeRes.json();
  const code = exchangeData.code;
  if (code !== 200 && code !== 'success' && exchangeData.status !== 'success') {
    const msg = exchangeData.msg || exchangeData.message || '未知错误';
    console.error(`❌ 激活授权失败，原因: ${msg}`);
    process.exit(1);
  }

  const data = exchangeData.data || {};
  const deviceToken = data.device_token;
  const pairToken = data.pair_token;
  const apiBase = data.api_base || (exchangeUrl.substring(0, exchangeUrl.indexOf('/open/v1')) + '/open/v1');
  const tokenExpiresIn = parseInt(data.expires_in) || 7200;
  const serverOauthUrl = data.oauth_url || data.oauth_base || '';

  if (!deviceToken || !pairToken) {
    console.error('❌ 激活授权返回的数据凭证不完整，缺少 device_token 或 pair_token。');
    process.exit(1);
  }

  console.log('🎉 令牌换券成功，已获得合法的客户端访问授权！');

  // 2. 确定 OAUTH_URL 与 Access Token 换取
  let oauthUrl = customOauthUrl || serverOauthUrl;
  if (!oauthUrl) {
    oauthUrl = 'https://agentlink.idaas.cmpassport.com/oauth2-service';
  }

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
  let activeExpiresIn = tokenExpiresIn;

  console.log('📡 正在与中移认证中心交互，自动发现模型列表...');
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
          activeExpiresIn = parseInt(tokenData.expires_in);
        }

        const modelsRes = await fetch(discoveryUrl, {
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + activeAccessToken
          }
        });

        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          const rawModels = Array.isArray(modelsData.models) 
            ? modelsData.models 
            : (modelsData.data && Array.isArray(modelsData.data) ? modelsData.data : null);

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

  // 3. 写入 openclaw.json
  const homeDir = os.homedir();
  const clawDir = path.join(homeDir, '.openclaw');
  const agentDir = path.join(clawDir, 'agents', 'main', 'agent');
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  const openclawJsonPath = path.join(clawDir, 'openclaw.json');
  let openclawJson = {};
  if (fs.existsSync(openclawJsonPath)) {
    try {
      openclawJson = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
    } catch(e) {
      console.warn('⚠️ 现有 openclaw.json 格式异常，将予以增量覆盖');
    }
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
  if (apiBase) {
    openclawJson.plugins.entries['cmtoken'].config.baseUrl = apiBase;
  }
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
  
  // 从部署接口地址推导 兔啃 渠道连接的 baseUrl
  let hubBaseUrl = '';
  try {
    const u = new URL(exchangeUrl);
    hubBaseUrl = u.origin + u.pathname.substring(0, u.pathname.lastIndexOf('/deploy/exchange'));
  } catch (e) {}

  openclawJson.plugins.entries['tuken'].config.baseUrl = hubBaseUrl || (exchangeUrl.substring(0, exchangeUrl.indexOf('/open/v1')) + '/open/v1');
  openclawJson.plugins.entries['tuken'].config.appId = hostId;
  openclawJson.plugins.entries['tuken'].config.appSecret = pairToken;
  openclawJson.plugins.entries['tuken'].config.instanceId = hostId;

  fs.writeFileSync(openclawJsonPath, JSON.stringify(openclawJson, null, 2), 'utf8');
  console.log('✅ [openclaw.json] 自动化模型与渠道配对参数合并写入完成！');

  // 4. 写入 auth-profiles.json (激活中移 OAuth access + refresh token)
  const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
  let authProfiles = { profiles: {} };
  if (fs.existsSync(authProfilesPath)) {
    try {
      authProfiles = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
    } catch(e) {}
  }
  authProfiles.profiles = authProfiles.profiles || {};
  authProfiles.profiles['cmtoken:default'] = {
    type: 'oauth',
    provider: 'cmtoken',
    access: activeAccessToken,
    refresh: deviceToken,
    expires: Date.now() + activeExpiresIn * 1000
  };
  fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf8');
  console.log('✅ [auth-profiles.json] 移动端换券 Refresh Token 设备激活写入完成！');
  
  console.log('🎉 所有连通配对与激活配置均已无损合并成功！');
})().catch(e => {
  console.error('❌ 动态激活配置执行发生致命异常:', e);
  process.exit(1);
});
