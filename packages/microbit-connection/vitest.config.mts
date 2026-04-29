import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/e2e/**", "build/**"],
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    mockReset: true,
  },
});
