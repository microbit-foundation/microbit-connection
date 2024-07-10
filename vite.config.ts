/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { resolve } from "path";
import { loadEnv } from "vite";
import { configDefaults, defineConfig, UserConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  const config: UserConfig = {
    base: process.env.BASE_URL ?? "/",
    build: {
      sourcemap: true,
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: resolve(__dirname, "lib/main.ts"),
        name: "MicrobitConnection",
        // the proper extensions will be added
        fileName: "microbit-connection",
      },
    },
    test: {
      exclude: [...configDefaults.exclude, "**/e2e/**"],
      environment: "jsdom",
      setupFiles: "./lib/setupTests.ts",
      mockReset: true,
    },
  };
  return config;
});
