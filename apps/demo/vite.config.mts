import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@microbit/microbit-connection/bluetooth": resolve(
        __dirname,
        "../../packages/microbit-connection/src/bluetooth-entrypoint.ts",
      ),
      "@microbit/microbit-connection/usb": resolve(
        __dirname,
        "../../packages/microbit-connection/src/usb-entrypoint.ts",
      ),
      "@microbit/microbit-connection/radio-bridge": resolve(
        __dirname,
        "../../packages/microbit-connection/src/radio-bridge-entrypoint.ts",
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
