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
 *   openclaw plugins install ./cmtoken.tgz
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
const OUTPUT_TGZ = resolve(ROOT, "cmtoken.tgz");

const doPack = process.argv.includes("--pack");

// ── Step 1: Build ──────────────────────────────────────────────────────
console.log("\n🔨 Building bundle...\n");

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
console.log("📦 Packaging cmtoken.tgz ...\n");

// Clean & create staging dir
if (existsSync(PACK_DIR)) rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });

const PKG_DIR = resolve(PACK_DIR, "package");
mkdirSync(PKG_DIR, { recursive: true });

// Copy artifacts into staging/package
copyFileSync(resolve(DIST, "index.js"), resolve(PKG_DIR, "index.js"));

// Sanitize package.json for bundling (remove dependencies as they are already bundled)
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
delete pkg.dependencies;
delete pkg.devDependencies;
delete pkg.scripts;
writeFileSync(resolve(PKG_DIR, "package.json"), JSON.stringify(pkg, null, 2));

if (existsSync(resolve(ROOT, "openclaw.plugin.json"))) {
  copyFileSync(resolve(ROOT, "openclaw.plugin.json"), resolve(PKG_DIR, "openclaw.plugin.json"));
}

// Create tarball
try {
  // Use -C and 'package' to ensure the root of the tarball is the 'package' directory
  execSync(`tar -czf "${OUTPUT_TGZ}" -C "${PACK_DIR}" package`, {
    stdio: "inherit",
    shell: true,
  });
} catch {
  console.error("❌ tar failed");
  process.exit(1);
}

// Cleanup staging
rmSync(PACK_DIR, { recursive: true, force: true });

console.log(`\n✅ Package → ${OUTPUT_TGZ}`);
console.log(`   Size: ${(statSync(OUTPUT_TGZ).size / 1024 / 1024).toFixed(1)} MB\n`);
console.log("Install with:");
console.log(`  openclaw plugins install "${OUTPUT_TGZ}"\n`);
