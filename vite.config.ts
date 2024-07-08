/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  loadEnv,
} from "vite";
import { configDefaults, defineConfig, UserConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  const config: UserConfig = {
    base: process.env.BASE_URL ?? "/",
    build: {
      outDir: "build",
      sourcemap: true,
    },
    server: {
      port: 3000,
    },
    assetsInclude: ["**/*.hex"],
    plugins: [
    ],
    test: {
      exclude: [...configDefaults.exclude, "**/e2e/**"],
      environment: "jsdom",
      setupFiles: "./src/setupTests.ts",
      mockReset: true,
    },
  };
  return config;
});
