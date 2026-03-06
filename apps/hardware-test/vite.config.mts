import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@microbit/microbit-connection/usb": resolve(
        __dirname,
        "../../packages/microbit-connection/src/usb/index.ts",
      ),
      "@microbit/microbit-connection/universal-hex": resolve(
        __dirname,
        "../../packages/microbit-connection/src/universal-hex-entrypoint.ts",
      ),
      "@microbit/microbit-connection": resolve(
        __dirname,
        "../../packages/microbit-connection/src/index.ts",
      ),
    },
  },
});
