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
        "../../packages/microbit-connection/src/bluetooth/index.ts",
      ),
      "@microbit/microbit-connection/usb": resolve(
        __dirname,
        "../../packages/microbit-connection/src/usb/index.ts",
      ),
      "@microbit/microbit-connection/radio-bridge": resolve(
        __dirname,
        "../../packages/microbit-connection/src/radio-bridge/index.ts",
      ),
      "@microbit/microbit-connection/universal-hex": resolve(
        __dirname,
        "../../packages/microbit-connection/src/universal-hex/index.ts",
      ),
      "@microbit/microbit-connection": resolve(
        __dirname,
        "../../packages/microbit-connection/src/index.ts",
      ),
    },
  },
});
