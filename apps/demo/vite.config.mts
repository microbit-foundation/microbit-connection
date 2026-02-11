import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@microbit/microbit-connection": resolve(
        __dirname,
        "../../packages/microbit-connection/src/index.ts",
      ),
    },
  },
});
