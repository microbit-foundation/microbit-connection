# microbit-connection

TypeScript library for connecting to BBC micro:bit devices via USB and Bluetooth (BLE), including partial and full (DFU) flashing. Published as `@microbit/microbit-connection` on NPM. This branch is based off the "apps" branch where we've added Capacitor support for use in a mobile app and are making various other breaking changes that will end up as a v1.0.0 when the app is stable.

## Monorepo structure

npm workspaces monorepo:

- **`packages/microbit-connection/`** — The library. Dual ESM + CJS build.
- **`apps/demo/`** — Vite + React demo app with Capacitor support for mobile.
- **`third-party/`** — Vendored dependencies (patched dapjs).

## Commands

```
npm run build:lib        # Build the library (ESM + CJS)
npm run build            # Build everything (lib + demo)
npm run dev              # Run demo app dev server
npm test                 # Run tests (vitest)
npm run format           # Prettier format
npm run format:check     # Prettier check
npm run docs             # Generate TypeDoc docs
```

From the library package directory (`packages/microbit-connection/`):

- `npx vitest run` — Run tests once
- `npx vitest` — Run tests in watch mode

## Key source areas

The library source is in `packages/microbit-connection/src/`:

- **Connection types**: `usb.ts` (WebUSB), `bluetooth.ts` (Web Bluetooth), `usb-radio-bridge.ts` (radio bridge via USB)
- **Flashing**: `flashing/` directory — `flashing-partial.ts` (partial flash over BLE/USB), `flashing-full.ts` (full flash), `nordic-dfu.ts` (DFU via Capacitor plugin), `flashing-v1.ts` (V1-specific)
- **BLE services**: `accelerometer-service.ts`, `button-service.ts`, `uart-service.ts`, `led-service.ts`, `magnetometer-service.ts`, `dfu-service.ts`, `partial-flashing-service.ts`, `device-information-service.ts`
- **Shared**: `device.ts` (core types/interfaces), `events.ts` (typed event target), `bluetooth-profile.ts` (UUIDs), `board-id.ts`

## Architecture notes

- Factory functions (`createWebUSBConnection`, `createWebBluetoothConnection`, `createRadioBridgeConnection`) are the public API entry points
- Capacitor platform support: native BLE via `@capacitor-community/bluetooth-le`, native DFU via `@microbit/capacitor-community-nordic-dfu` (from `../nordic-dfu/`). These are peer dependencies.
- `Capacitor.isNativePlatform()` is used to branch between web and native code paths.

## Related projects

Note: these paths rely on an {org}/{repo} scheme for checkouts that might not hold for all developers. If projects are not available then ask the user.

### Capacitor plugins

- **`../nordic-dfu/`** — Capacitor plugin wrapping the Nordic DFU libraries (iOS: iOSDFULibrary, Android: Android-DFU-Library). The iOS plugin code (`ios/Plugin/Plugin.swift`) configures the DFU initiator.

### Native apps (reference implementations)

- **`../microbit-ios/`** — The official micro:bit iOS app. Its DFU flow in `Source/irmLink.m` (lines ~3810-3885) is the reference for how DFU should work on iOS. The bundled `Pods/iOSDFULibrary/` contains the iOS DFU library source, useful for understanding scan/reconnect behaviour.
- **`../microbit-android/`** — The official micro:bit Android app. Its DFU setup in `app/src/main/java/.../ProjectActivity.java` is the reference for Android DFU options.

### Firmware and bootloader

- **`../v2-bootloader/`** — micro:bit V2 bootloader. Key files:
  - `bootloader/microbit/config/sdk_config.h` — build config (`NRF_DFU_BLE_REQUIRES_BONDS`, `NRF_DFU_BLE_ADV_NAME`)
  - `nRF5SDK_mods/components/libraries/bootloader/ble_dfu/nrf_dfu_ble.c` — BLE transport with micro:bit-specific runtime patches (peer data validation, write permission downgrade, advertising name handling)
  - `bootloader/main.c` — DFU observer and LED display symbols
- **`../../lancaster-university/codal-microbit-v2/`** — micro:bit V2 runtime (CODAL). BLE stack configuration in `source/bluetooth/MicroBitBLEManager.cpp`.
- **`../../lancaster-university/microbit-dal/`** — micro:bit V1 runtime (DAL).
