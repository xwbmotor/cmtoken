#!/usr/bin/env node
/**
 * Tuken Plugin — Build & Package Script
 *
 * Usage:
 *   node scripts/build.mjs          # Build only (dist/index.js, dist/setup-entry.js)
 *   node scripts/build.mjs --pack   # Build + generate tuken.tgz
 *
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, copyFileSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const PACK_DIR = resolve(ROOT, ".pack-staging");

const doPack = process.argv.includes("--pack");

console.log("🔨 Building Tuken channel plugin bundles...\n");

// Ensure clean dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Use local esbuild if it exists, otherwise fallback to npx
const localEsbuild = resolve(ROOT, "node_modules/.bin/esbuild");
const parentEsbuild = resolve(ROOT, "../node_modules/.bin/esbuild");
let esbuildBin = "npx esbuild";
if (existsSync(localEsbuild)) {
  esbuildBin = `"${localEsbuild}"`;
} else if (existsSync(parentEsbuild)) {
  esbuildBin = `"${parentEsbuild}"`;
}

const buildEntry = (src, dest) => {
  const cmd = [
    esbuildBin,
    `"${resolve(ROOT, src)}"`,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile="${resolve(DIST, dest)}"`,
    "--external:node:*",
    "--external:openclaw/plugin-sdk",
    "--external:openclaw/plugin-sdk/*",
    "--external:@openclaw/*",
    "--minify",
    "--sourcemap",
  ].join(" ");
  execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true });
};

try {
  console.log("⚡ Bundling index.ts...");
  buildEntry("index.ts", "index.js");
  console.log("⚡ Bundling setup-entry.ts...");
  buildEntry("setup-entry.ts", "setup-entry.js");
} catch (err) {
  console.error("❌ esbuild failed:", err);
  process.exit(1);
}

console.log(`\n✅ Built successfully!`);

if (!doPack) {
  console.log("Done. Pass --pack to also generate tuken.tgz\n");
  process.exit(0);
}

// ── Packaging ──────────────────────────────────────────────────────────
console.log("\n📦 Packaging tuken.tgz...\n");

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const RELEASES_DIR = resolve(ROOT, "releases");
if (!existsSync(RELEASES_DIR)) mkdirSync(RELEASES_DIR, { recursive: true });

const archivedName = `tuken-v${version}.tgz`;
const finalTgzPath = resolve(RELEASES_DIR, archivedName);

// Clean & create staging dir
if (existsSync(PACK_DIR)) rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });

const PKG_DIR = resolve(PACK_DIR, "package");
mkdirSync(PKG_DIR, { recursive: true });

// Copy compiled artifacts into staging/package
copyFileSync(resolve(DIST, "index.js"), resolve(PKG_DIR, "index.js"));
copyFileSync(resolve(DIST, "setup-entry.js"), resolve(PKG_DIR, "setup-entry.js"));

if (existsSync(resolve(DIST, "index.js.map"))) {
  copyFileSync(resolve(DIST, "index.js.map"), resolve(PKG_DIR, "index.js.map"));
}
if (existsSync(resolve(DIST, "setup-entry.js.map"))) {
  copyFileSync(resolve(DIST, "setup-entry.js.map"), resolve(PKG_DIR, "setup-entry.js.map"));
}

// Sanitize package.json for bundling
const bundlePkg = { ...pkg };
delete bundlePkg.dependencies;
delete bundlePkg.devDependencies;
delete bundlePkg.scripts;

// Point the openclaw paths inside the distributed package to the root files!
bundlePkg.openclaw = {
  ...bundlePkg.openclaw,
  extensions: ["./index.js"],
  setupEntry: "./setup-entry.js",
};

writeFileSync(resolve(PKG_DIR, "package.json"), JSON.stringify(bundlePkg, null, 2));

if (existsSync(resolve(ROOT, "openclaw.plugin.json"))) {
  copyFileSync(resolve(ROOT, "openclaw.plugin.json"), resolve(PKG_DIR, "openclaw.plugin.json"));
}
if (existsSync(resolve(ROOT, "README.md"))) {
  copyFileSync(resolve(ROOT, "README.md"), resolve(PKG_DIR, "README.md"));
}

// Create tarball
try {
  if (existsSync(finalTgzPath)) rmSync(finalTgzPath);
  
  execSync(`tar -czf "${finalTgzPath}" -C "${PACK_DIR}" package`, {
    stdio: "inherit",
    shell: true,
  });
} catch (err) {
  console.error("❌ tar failed:", err);
  process.exit(1);
}

// Cleanup staging
rmSync(PACK_DIR, { recursive: true, force: true });

const stats = statSync(finalTgzPath);
console.log(`\n✅ Package → ${finalTgzPath}`);
console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);

console.log("\nInstall with:");
console.log(`  openclaw plugins install "./releases/${archivedName}"\n`);
