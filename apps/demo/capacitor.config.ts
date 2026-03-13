import type { CapacitorConfig } from "@capacitor/cli";
import { networkInterfaces } from "os";

const config: CapacitorConfig = {
  appId: "org.microbit.connection.kitchensink",
  appName: "kitchen-sink",
  webDir: "dist",
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Scanning...",
        cancel: "Cancel",
        availableDevices: "Available devices",
        noDeviceFound: "No device found",
      },
    },
    StatusBar: {
      style: "Light",
      backgroundColor: "#000000",
      overlaysWebView: false,
    },
  },
};

function getIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  throw new Error("Could not guess Vite server IP");
}

if (process.env.CAP_LOCAL_DEV) {
  config.server = { url: `http://${getIP()}:5173`, cleartext: true };
}

export default config;
