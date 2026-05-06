import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  outDir: "dist",
  clean: true,
  bundle: true,
  // 强制 external 列表，只保留 SDK 和 Node 内置模块
  // 这样 json5 等库就会被强制打包进 index.js
  external: [
    /^node:/,
    /^openclaw\/plugin-sdk/,
  ],
  rolldownOptions: {
    output: {
      // 尽可能减少分块，方便单文件分发
      inlineDynamicImports: true,
    }
  }
});
