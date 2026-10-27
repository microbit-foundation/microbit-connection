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

The `ios/` and `android/` native projects are included, so there's no need to run `npx cap add`.
Build the library and the demo, then sync them and the plugin native code into the native projects:

```bash
# From the monorepo root
npm run build

cd apps/demo
npx cap sync
npx cap open ios     # or android, to open Xcode / Android Studio
```

Note that the native projects resolve plugins from the **monorepo root** `node_modules`, not from
`apps/demo/node_modules` (see the paths in `ios/App/Podfile` and `android/capacitor.settings.gradle`).

For local development with live reload:

```bash
npm run dev:apps                  # Vite dev server on --host
CAP_LOCAL_DEV=1 npx cap sync     # points native project at dev server
npx cap run ios                  # or android
```
