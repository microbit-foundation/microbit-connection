import { resolve } from "path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [basicSsl()],
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
