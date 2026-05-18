#!/usr/bin/env node
/**
 * CMToken & Tuken — Multi-Platform Offline Package Builder (openclaw.install.<platform>.tgz)
 *
 * This script automates the assembly of multi-platform offline installers.
 * It downloads portable Node.js and Git for different platforms, copies local
 * compiled CMToken and Tuken plugins, and bundles them into target tgz archives.
 *
 * Usage:
 *   node shell/packet/build.mjs --platform=win
 *   node shell/packet/build.mjs --platform=linux
 *   node shell/packet/build.mjs --platform=mac
 *   node shell/packet/build.mjs --all
 *
 * Output:
 *   shell/packet/dist/openclaw.install.win.tgz
 *   shell/packet/dist/openclaw.install.linux.tgz
 *   shell/packet/dist/openclaw.install.mac.tgz
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../.."); // e:\ai\cmtoken\gitee\cmtoken
const PACKET_DIR = resolve(__dirname);
const CACHE_DIR = resolve(PACKET_DIR, ".cache");
const RELEASES_DIR = resolve(ROOT, "shell/releases");

// Platform download specs
const DOWNLOADS = {
  win: {
    node: {
      url: "https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip",
      file: "node-v22.11.0-win-x64.zip"
    },
    git: {
      url: "https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/MinGit-2.47.0.2-64-bit.zip",
      file: "MinGit-2.47.0.2-64-bit.zip"
    }
  },
  linux: {
    node: {
      url: "https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz",
      file: "node-v22.11.0-linux-x64.tar.xz"
    }
  },
  mac: {
    node: {
      url: "https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-x64.tar.gz",
      file: "node-v22.11.0-darwin-x64.tar.gz"
    }
  }
};

const OPENCLAW_SOURCE_URL = "https://github.com/openclaw/openclaw/archive/refs/heads/main.tar.gz";
const OPENCLAW_SOURCE_FILE = "openclaw-main.tar.gz";

// Parse CLI args
const allPlatforms = process.argv.includes("--all");
const forceFresh = process.argv.includes("--fresh") || process.argv.includes("--force");
const platformArg = process.argv.find(arg => arg.startsWith("--platform="))?.split("=")[1];

let targetPlatforms = [];
if (allPlatforms) {
  targetPlatforms = ["win", "linux", "mac"];
} else if (platformArg && ["win", "linux", "mac"].includes(platformArg)) {
  targetPlatforms = [platformArg];
} else {
  // Default to host OS
  if (process.platform === "win32") {
    targetPlatforms = ["win"];
  } else if (process.platform === "darwin") {
    targetPlatforms = ["mac"];
  } else {
    targetPlatforms = ["linux"];
  }
  console.log(`ℹ️ No target specified. Defaulting to host platform: ${targetPlatforms[0]}`);
}

// ── Helper functions ──────────────────────────────────────────────────────────
function logStep(msg) {
  console.log(`\n\x1b[36m\x1b[1m⚙️  ${msg}\x1b[0m`);
}

function logSuccess(msg) {
  console.log(`\x1b[32m✔ ${msg}\x1b[0m`);
}

function logError(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  if (existsSync(dest)) {
    console.log(`  [Cache Hit] ${dest}`);
    return;
  }
  console.log(`  Downloading: ${url} -> ${dest}`);
  execSync(`curl -L -o "${dest}" "${url}"`, { stdio: "inherit" });
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────
ensureDir(CACHE_DIR);
ensureDir(RELEASES_DIR);

logStep("Ensuring Global OpenClaw Core Codebase...");
const openClawSourcePath = resolve(CACHE_DIR, OPENCLAW_SOURCE_FILE);
if (forceFresh && existsSync(openClawSourcePath)) {
  console.log("  [Force Fresh] Deleting cached OpenClaw source and redownloading...");
  rmSync(openClawSourcePath, { force: true });
}
downloadFile(OPENCLAW_SOURCE_URL, openClawSourcePath);

for (const platform of targetPlatforms) {
  logStep(`Building package for platform: ${platform.toUpperCase()}`);
  
  const staging = resolve(PACKET_DIR, `staging-${platform}`);
  rmSync(staging, { recursive: true, force: true });
  ensureDir(staging);
  
  // 1. Download node & git for this platform
  const spec = DOWNLOADS[platform];
  if (spec.node) {
    const dest = resolve(CACHE_DIR, spec.node.file);
    logStep(`Ensuring Node.js portable for ${platform}...`);
    downloadFile(spec.node.url, dest);
    copyFileSync(dest, resolve(staging, spec.node.file));
  }
  if (spec.git) {
    const dest = resolve(CACHE_DIR, spec.git.file);
    logStep(`Ensuring Git portable for ${platform}...`);
    downloadFile(spec.git.url, dest);
    copyFileSync(dest, resolve(staging, spec.git.file));
  }

  // 2. Add OpenClaw core source code archive
  logStep("Adding OpenClaw Core Source Code...");
  copyFileSync(resolve(CACHE_DIR, OPENCLAW_SOURCE_FILE), resolve(staging, "openclaw.tar.gz"));

  // 3. Add CMToken and Tuken compiled plugins
  logStep("Injecting local CMToken and Tuken compiled plugins...");
  const cmtokenTgz = resolve(ROOT, "releases/cmtoken-v1.0.0-prod.tgz");
  const tukenTgz = resolve(ROOT, "channel/releases/tuken-v0.6.0.tgz");
  
  if (!existsSync(cmtokenTgz)) {
    logError(`Missing CMToken compiled archive! Expected at: ${cmtokenTgz}`);
    console.log("Please run 'pnpm run pack --env=prod' first in workspace root!");
    process.exit(1);
  }
  if (!existsSync(tukenTgz)) {
    logError(`Missing Tuken compiled archive! Expected at: ${tukenTgz}`);
    console.log("Please run 'pnpm run pack' first in channel directory!");
    process.exit(1);
  }

  copyFileSync(cmtokenTgz, resolve(staging, "cmtoken-v1.0.0-prod.tgz"));
  copyFileSync(tukenTgz, resolve(staging, "tuken-v0.6.0.tgz"));

  // 4. Archive staging directory
  logStep(`Compressing offline package for ${platform}...`);
  const outTgzName = `openclaw.install.${platform}.tgz`;
  const outTgzPath = resolve(RELEASES_DIR, outTgzName);
  
  rmSync(outTgzPath, { force: true });
  
  // Use cross-platform tar command via child_process
  console.log(`  Packaging: ${staging} -> ${outTgzPath}`);
  execSync(`tar -czf "${outTgzPath}" -C "${staging}" .`, { stdio: "inherit" });
  
  // Clean staging
  rmSync(staging, { recursive: true, force: true });
  
  logSuccess(`Package created: ${outTgzPath}`);
}

// Copy deployment scripts into shell/releases to unify distribution files
logStep("Copying installer scripts to unified releases folder...");
ensureDir(RELEASES_DIR);

// Read and encode activate.js to base64 for self-contained deployment
const activateJsSrc = resolve(ROOT, "shell/activate.js");
let activateJsBase64 = "";
if (existsSync(activateJsSrc)) {
  const activateJsContent = readFileSync(activateJsSrc, "utf8");
  activateJsBase64 = Buffer.from(activateJsContent).toString("base64");
}

const scriptsToCopy = ["install.sh", "install.bat", "install.ps1", "activate.js", "README.md"];
for (const script of scriptsToCopy) {
  const src = resolve(ROOT, "shell", script);
  const dest = resolve(RELEASES_DIR, script);
  if (existsSync(src)) {
    if (script === "install.sh" || script === "install.ps1") {
      let content = readFileSync(src, "utf8");
      content = content.replace(/__ACTIVATE_JS_BASE64_PLACEHOLDER__/g, activateJsBase64);
      writeFileSync(dest, content, "utf8");
      console.log(`  Compiled and Copied: ${script} -> shell/releases/ (with inline activate.js)`);
    } else {
      copyFileSync(src, dest);
      console.log(`  Copied: ${script} -> shell/releases/`);
    }
  }
}

// Copy standalone plugins to releases directory for lightweight mode
logStep("Copying standalone plugins to unified releases folder...");
const cmtokenTgzGlobal = resolve(ROOT, "releases/cmtoken-v1.0.0-prod.tgz");
const tukenTgzGlobal = resolve(ROOT, "channel/releases/tuken-v0.6.0.tgz");
if (existsSync(cmtokenTgzGlobal)) {
  copyFileSync(cmtokenTgzGlobal, resolve(RELEASES_DIR, "cmtoken-v1.0.0-prod.tgz"));
  console.log("  Copied: cmtoken-v1.0.0-prod.tgz -> shell/releases/");
}
if (existsSync(tukenTgzGlobal)) {
  copyFileSync(tukenTgzGlobal, resolve(RELEASES_DIR, "tuken-v0.6.0.tgz"));
  console.log("  Copied: tuken-v0.6.0.tgz -> shell/releases/");
}

logStep("🎉 All packages and scripts aggregated successfully in releases!");
console.log(`Release directory: ${RELEASES_DIR}`);
readdirSync(RELEASES_DIR).forEach(file => {
  console.log(`  - ${file}`);
});
