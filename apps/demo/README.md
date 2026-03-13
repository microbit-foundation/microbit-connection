# micro:bit connection demo

A React demo app for the [`@microbit/microbit-connection`](../../packages/microbit-connection/) library. It exercises USB, Bluetooth, and radio bridge connections, flashing, sensors, LEDs, serial, and UART.

The same codebase runs as a web app (using WebUSB and Web Bluetooth) and as a native mobile app (using [Capacitor](https://capacitorjs.com/) for Bluetooth and DFU on iOS/Android).

## Web only

If you only care about the web demo, you can ignore the Capacitor dependencies entirely. The app detects the platform at runtime via `Capacitor.isNativePlatform()` and the native-only code paths are never reached in a browser.

```bash
# From the monorepo root
npm run build:lib
npm run dev
```

## Mobile (Capacitor)

To run on iOS or Android you need the native projects. These are not checked in — generate them with:

```bash
cd apps/demo
npx cap add ios      # or android
npx cap sync
npx cap open ios     # opens Xcode
```

For local development with live reload:

```bash
npm run dev:apps                  # Vite dev server on --host
CAP_LOCAL_DEV=1 npx cap sync     # points native project at dev server
npx cap run ios                  # or android
```
