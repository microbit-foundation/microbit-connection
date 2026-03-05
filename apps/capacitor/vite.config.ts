import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@microbit/microbit-connection/bluetooth": resolve(
        __dirname,
        "../../packages/microbit-connection/src/bluetooth-entrypoint.ts",
      ),
      "@microbit/microbit-connection/usb": resolve(
        __dirname,
        "../../packages/microbit-connection/src/usb/index.ts",
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
