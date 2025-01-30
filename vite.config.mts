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
      // Retain the option for a regular build
      lib:
        mode === "demo"
          ? undefined
          : {
              entry: resolve(__dirname, "lib/index.ts"),
              name: "MicrobitConnection",
              fileName: "microbit-connection",
            },
    },
    test: {
      exclude: [...configDefaults.exclude, "**/e2e/**", "build"],
      environment: "jsdom",
      setupFiles: "./lib/setupTests.ts",
      mockReset: true,
    },
  };
  return config;
});
