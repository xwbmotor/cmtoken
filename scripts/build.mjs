#!/usr/bin/env node
/**
 * CMToken Plugin — Build & Package Script
 *
 * Usage:
 *   node scripts/build.mjs          # Build only (dist/index.js)
 *   node scripts/build.mjs --pack   # Build + generate cmtoken.tgz
 *
 * The resulting .tgz is a fully self-contained plugin archive that can be
 * installed on any OpenClaw host via:
 *   openclaw plugins install ./releases/cmtoken-v1.0.0-test.tgz
 *
 */

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");           // extensions/cmtoken
const DIST = resolve(ROOT, "dist");
const PACK_DIR = resolve(ROOT, ".pack-staging");

const doPack = process.argv.includes("--pack");
const envArg = process.argv.find(arg => arg.startsWith("--env="))?.split("=")[1] || "test";

// Load environment config
const envsPath = resolve(ROOT, "environments.json");
if (!existsSync(envsPath)) {
  console.error("❌ environments.json not found");
  process.exit(1);
}
const envs = JSON.parse(readFileSync(envsPath, "utf8"));
const config = envs[envArg];

if (!config) {
  console.error(`❌ Unknown environment: ${envArg}`);
  process.exit(1);
}

console.log(`\n🌟 Environment: ${envArg.toUpperCase()}`);

// ── Step 1: Build ──────────────────────────────────────────────────────
console.log("🔨 Building bundle...\n");

// Use local esbuild if it exists, otherwise fallback to npx
const localEsbuild = resolve(ROOT, "node_modules/.bin/esbuild");
const esbuildBin = existsSync(localEsbuild) ? `"${localEsbuild}"` : "npx esbuild";

const esbuildCmd = [
  esbuildBin,
  `"${resolve(ROOT, "src/index.ts")}"`,
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--outfile="${resolve(DIST, "index.js")}"`,
  "--external:node:*",
  "--external:openclaw/plugin-sdk",
  "--external:openclaw/plugin-sdk/*",
  "--external:@openclaw/*",
  "--minify",
  "--sourcemap",
  // Inject built-in constants
  `--define:process.env.CMTOKEN_BASE_URL="\\"${config.BASE_URL}\\""`,
  `--define:process.env.CMTOKEN_DISCOVERY_URL="\\"${config.DISCOVERY_URL}\\""`,
  `--define:process.env.CMTOKEN_OAUTH_URL="\\"${config.OAUTH_URL}\\""`,
  `--define:process.env.CMTOKEN_CLIENT_ID="\\"${config.CLIENT_ID}\\""`,
  `--define:process.env.BUILD_ENV="\\"${envArg}\\""`,
].join(" ");

try {
  execSync(esbuildCmd, { stdio: "inherit", cwd: ROOT, shell: true });
} catch {
  console.error("❌ esbuild failed");
  process.exit(1);
}

console.log(`\n✅ Built → ${resolve(DIST, "index.js")}\n`);

if (!doPack) {
  console.log("Done. Pass --pack to also generate cmtoken.tgz\n");
  process.exit(0);
}

// ── Step 2: Pack ───────────────────────────────────────────────────────
console.log("📦 Packaging...\n");

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const RELEASES_DIR = resolve(ROOT, "releases");
if (!existsSync(RELEASES_DIR)) mkdirSync(RELEASES_DIR, { recursive: true });

const archivedName = `cmtoken-v${version}-${envArg}.tgz`;
const finalTgzPath = resolve(RELEASES_DIR, archivedName);

// Clean & create staging dir
if (existsSync(PACK_DIR)) rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });

const PKG_DIR = resolve(PACK_DIR, "package");
mkdirSync(PKG_DIR, { recursive: true });

// Copy artifacts into staging/package
mkdirSync(resolve(PKG_DIR, "dist"), { recursive: true });
copyFileSync(resolve(DIST, "index.js"), resolve(PKG_DIR, "dist", "index.js"));

// Sanitize package.json for bundling
const bundlePkg = { ...pkg };
delete bundlePkg.dependencies;
delete bundlePkg.devDependencies;
delete bundlePkg.scripts;
writeFileSync(resolve(PKG_DIR, "package.json"), JSON.stringify(bundlePkg, null, 2));

if (existsSync(resolve(ROOT, "openclaw.plugin.json"))) {
  copyFileSync(resolve(ROOT, "openclaw.plugin.json"), resolve(PKG_DIR, "openclaw.plugin.json"));
}

// Create tarball directly in releases/
try {
  if (existsSync(finalTgzPath)) rmSync(finalTgzPath);
  
  execSync(`tar -czf "${finalTgzPath}" -C "${PACK_DIR}" package`, {
    stdio: "inherit",
    shell: true,
  });
} catch {
  console.error("❌ tar failed");
  process.exit(1);
}

// Cleanup staging
rmSync(PACK_DIR, { recursive: true, force: true });

const stats = statSync(finalTgzPath);
console.log(`\n✅ Package → ${finalTgzPath}`);
console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

console.log("\nInstall with:");
console.log(`  openclaw plugins install "./releases/${archivedName}"\n`);
