# micro:bit Connection Demo

Demo Capacitor app for micro:bit Bluetooth connection and flashing.

## Quick start

```bash
npm install
npm run build
npx cap sync
```

Bluetooth requires a physical device — simulators won't work.

### iOS

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target, go to **Signing & Capabilities**, and select your development team
3. Build and run on a device

### Android

1. Open the `android/` directory in Android Studio
2. Build and run on a device

### Live reload

To iterate on the web app with live reload on a connected device:

```bash
npm run dev:apps          # Start Vite dev server on local network
npm run cap:sync:dev      # Sync with local dev server URL
```

Then build and run from Xcode or Android Studio.

## Status

| Device platform | micro:bit version | Full flash | Partial flash (MakeCode) |
| --------------- | ----------------- | ---------- | ------------------------ |
| Android         | V1                | ✅         | ✅                       |
| Android         | V2                | ✅         | ✅                       |
| iOS             | V1                | ✅         | ✅                       |
| iOS             | V2                | ✅         | ✅                       |

Flashing over an open link hex is not yet supported.