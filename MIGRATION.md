# Migration guide (v0 → v1)

These breaking changes are currently available as `0.9.0-apps.alpha.N` pre-releases on npm. Once testing is complete they will be published as `1.0.0`.

## Subpath exports

Everything was previously exported from a single entry point. Imports are now split across subpath exports:

| v0 import                       | v1 import                                           |
| ------------------------------- | --------------------------------------------------- |
| `@microbit/microbit-connection` | `@microbit/microbit-connection` (shared types only) |
| `@microbit/microbit-connection` | `@microbit/microbit-connection/bluetooth`           |
| `@microbit/microbit-connection` | `@microbit/microbit-connection/usb`                 |
| `@microbit/microbit-connection` | `@microbit/microbit-connection/radio-bridge`        |
| `@microbit/microbit-connection` | `@microbit/microbit-connection/universal-hex`       |

The root entry point now only exports shared types and utilities (`ConnectionStatus`, `DeviceError`, `FlashDataError`, `assertConnected`, `ProgressStage`, data types, etc.). Connection-specific factory functions and types must be imported from their subpath.

```ts
// v0
import {
  createWebUSBConnection,
  createWebBluetoothConnection,
  createRadioBridgeConnection,
  createUniversalHexFlashDataSource,
  ConnectionStatus,
} from "@microbit/microbit-connection";

// v1
import { ConnectionStatus } from "@microbit/microbit-connection";
import { createUSBConnection } from "@microbit/microbit-connection/usb";
import { createBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { createRadioBridgeConnection } from "@microbit/microbit-connection/radio-bridge";
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection/universal-hex";
```

## Renamed exports

### Factory functions

| v0                               | v1                            |
| -------------------------------- | ----------------------------- |
| `createWebUSBConnection()`       | `createUSBConnection()`       |
| `createWebBluetoothConnection()` | `createBluetoothConnection()` |

### Connection types

| v0                                      | v1                                   |
| --------------------------------------- | ------------------------------------ |
| `MicrobitWebUSBConnection`              | `MicrobitUSBConnection`              |
| `MicrobitWebUSBConnectionOptions`       | `MicrobitUSBConnectionOptions`       |
| `MicrobitWebBluetoothConnection`        | `MicrobitBluetoothConnection`        |
| `MicrobitWebBluetoothConnectionOptions` | `MicrobitBluetoothConnectionOptions` |

## Enums → const objects

`ConnectionStatus`, `ButtonState`, and `DeviceSelectionMode` have all changed from TypeScript `enum` declarations to `as const` objects. Property access like `ConnectionStatus.Connected` still works, but there are some differences:

- **String values changed casing** — e.g. `"NO_AUTHORIZED_DEVICE"` → `"NoAuthorizedDevice"`. Code that compares against the string literals directly (rather than using the constant) will need updating.
- **Type identity** — the TypeScript type is now a union of literal values (e.g. `"Connected" | "Disconnected" | ...`) rather than the enum type. In practice this rarely matters unless you were using `typeof ConnectionStatus` as a type, which is now the object type rather than the union. Use the `ConnectionStatus` type (not `typeof`) for the union.
- **`ButtonState` numeric values are unchanged** (`0`, `1`, `2`) so runtime behaviour is the same.
- **`DeviceSelectionMode` values are unchanged** (`"AlwaysAsk"`, `"UseAnyAllowed"`).

### `ConnectionStatus` — non-trivial changes

Beyond the casing change, several members were added or removed:

| v0 (enum)              | v1 (const)                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `SUPPORT_NOT_KNOWN`    | Removed — use `checkAvailability()` instead                     |
| `NOT_SUPPORTED`        | Removed — use `checkAvailability()` instead                     |
| `NO_AUTHORIZED_DEVICE` | `NoAuthorizedDevice`                                            |
| `DISCONNECTED`         | `Disconnected`                                                  |
| `CONNECTED`            | `Connected`                                                     |
| `CONNECTING`           | `Connecting`                                                    |
| `RECONNECTING`         | Removed                                                         |
| —                      | `Paused` (new — USB connection suspended due to tab visibility) |

## `DeviceErrorCode` values renamed

| v0                         | v1                                  |
| -------------------------- | ----------------------------------- |
| `"update-req"`             | `"firmware-update-required"`        |
| `"clear-connect"`          | `"device-in-use"`                   |
| `"timeout-error"`          | `"timeout"`                         |
| `"reconnect-microbit"`     | `"connection-error"`                |
| `"background-comms-error"` | Removed (uses `"connection-error"`) |
| `"service-missing"`        | Removed                             |
| —                          | `"aborted"` (new)                   |
| —                          | `"unsupported"` (new)               |
| —                          | `"disabled"` (new)                  |
| —                          | `"permission-denied"` (new)         |
| —                          | `"location-disabled"` (new)         |
| —                          | `"not-connected"` (new)             |
| —                          | `"pairing-information-lost"` (new)  |

## Event system overhaul

### No longer extends DOM `EventTarget`

`TypedEventTarget` is no longer a wrapper around the DOM `EventTarget`. It is now a standalone typed event emitter. Listeners receive **plain data objects** instead of `Event` subclass instances.

### Event classes removed

The following event classes are removed. Listeners now receive plain data directly:

| v0 class                 | v1 listener data                                        |
| ------------------------ | ------------------------------------------------------- |
| `ConnectionStatusEvent`  | `ConnectionStatusChange` (`{ status, previousStatus }`) |
| `BackgroundErrorEvent`   | `BackgroundErrorData` (`{ error, event? }`)             |
| `BeforeRequestDevice`    | `void` (no argument)                                    |
| `AfterRequestDevice`     | `void` (no argument)                                    |
| `FlashEvent`             | `void` (no argument)                                    |
| `AccelerometerDataEvent` | `AccelerometerData` (`{ x, y, z }`)                     |
| `ButtonEvent`            | `ButtonData` (`{ button, state }`)                      |
| `MagnetometerDataEvent`  | `MagnetometerData` (`{ x, y, z }`)                      |
| `UARTDataEvent`          | `UartData` (`{ value }`)                                |
| `SerialDataEvent`        | `SerialData` (`{ data }`)                               |
| `SerialResetEvent`       | `void`                                                  |
| `SerialErrorEvent`       | Removed (uses backgrounderror)                          |

```ts
// v0
connection.addEventListener("status", (event: ConnectionStatusEvent) => {
  console.log(event.status);
});
connection.addEventListener(
  "accelerometerdatachanged",
  (event: AccelerometerDataEvent) => {
    console.log(event.data.x);
  },
);

// v1
connection.addEventListener("status", (data: ConnectionStatusChange) => {
  console.log(data.status, data.previousStatus);
});
connection.addEventListener(
  "accelerometerdatachanged",
  (data: AccelerometerData) => {
    console.log(data.x);
  },
);
```

### `addEventListener` / `removeEventListener` options removed

The v0 `addEventListener` accepted an optional third `options` parameter (matching the DOM API: `once`, `capture`, `passive`). In v1, no options parameter is accepted.

### `dispatchEvent` / `dispatchTypedEvent` removed

These are no longer part of the public `TypedEventTarget` API. Event dispatching is internal only.

### `backgrounderror` event data changed

| v0                                                 | v1                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `BackgroundErrorEvent` with `errorMessage: string` | `BackgroundErrorData` with `error: DeviceError` and optional `event?: string` |

### Button event data changed

v0 dispatched a `ButtonEvent` with a `state` property and the event type (`"buttonachanged"` / `"buttonbchanged"`) encoded in the event name.

v1 dispatches a `ButtonData` object with both `button` (`"A"` / `"B"`) and `state` fields.

### Serial events are USB-only, Bluetooth has UART

In v0, serial events and `serialWrite()` were on the base `DeviceConnection` interface. In v1, serial is specific to USB and UART is specific to Bluetooth:

- `"serialdata"`, `"serialreset"`, and `serialWrite(data: string)` are only on `MicrobitUSBConnection`.
- `"uartdata"` and `uartWrite(data: Uint8Array)` are only on `MicrobitBluetoothConnection`.
- `"serialerror"` / `SerialErrorEvent` are removed (errors surface via `"backgrounderror"`).

## `DeviceConnection` interface changes

### `connect()` return type

```ts
// v0
connect(): Promise<ConnectionStatus>;

// v1
connect(options?: ConnectOptions): Promise<void>;
```

`connect()` no longer returns the final `ConnectionStatus`. It throws a `DeviceError` on failure instead, so the return value is unnecessary — success means connected, failure means an exception with a specific `DeviceErrorCode`. It now also accepts an optional `ConnectOptions` with `progress` and `signal` fields.

### `getBoardVersion()` return type

```ts
// v0
getBoardVersion(): BoardVersion | undefined;

// v1
getBoardVersion(): BoardVersion; // throws DeviceError("not-connected") if not connected
```

### `flash()` is optional and moved

`flash()` was not on the base `DeviceConnection` in v0. In v1 it is an optional method on `DeviceConnection` (`flash?(...)`), with concrete implementations on `MicrobitUSBConnection` and `MicrobitBluetoothConnection`.

### `checkAvailability()` added

```ts
checkAvailability(): Promise<ConnectionAvailabilityStatus>;
```

Replaces the old `SUPPORT_NOT_KNOWN` / `NOT_SUPPORTED` connection statuses.

### `type` property added

All connections now expose a readonly `type` property (`"usb"`, `"bluetooth"`, or `"radio-bridge"`).

## `FlashOptions.progress` callback changed

```ts
// v0
progress: (percentage: number | undefined, partial: boolean) => void;

// v1
progress: ProgressCallback;
// where ProgressCallback = (stage: ProgressStage, progress?: number) => void;
```

The callback is now a `ProgressCallback` that receives a `ProgressStage` enum value and an optional 0–1 progress number, rather than a percentage and partial flag.

## `FlashOptions.partial` default

`FlashOptions.partial` is now optional and defaults to `true` (was required in v0).

## Bluetooth getter return types

Methods that previously returned `T | undefined` now throw if not connected:

| Method                     | v0 return                        | v1 return           |
| -------------------------- | -------------------------------- | ------------------- |
| `getAccelerometerData()`   | `AccelerometerData \| undefined` | `AccelerometerData` |
| `getAccelerometerPeriod()` | `number \| undefined`            | `number`            |
| `getLedScrollingDelay()`   | `number \| undefined`            | `number`            |
| `getLedMatrix()`           | `LedMatrix \| undefined`         | `LedMatrix`         |
| `getMagnetometerData()`    | `MagnetometerData \| undefined`  | `MagnetometerData`  |
| `getMagnetometerBearing()` | `number \| undefined`            | `number`            |
| `getMagnetometerPeriod()`  | `number \| undefined`            | `number`            |

## USB `getDeviceId()` return type

```ts
// v0
getDeviceId(): number | undefined;

// v1
getDeviceId(): number; // throws if not connected
```

## Removed exports

The following are no longer exported from the package:

- `BoardId` — use the connection's own methods instead
- `TypedEventTarget` — internal implementation detail
- `DeviceConnectionEventMap` — event maps are no longer exported as classes
- `SerialConnectionEventMap` — replaced by typed overloads on connection interfaces
- `ServiceConnectionEventMap` — replaced by typed overloads on connection interfaces
- `NullLogging` — not part of public API

## Tab visibility handling (`pauseOnHidden`)

In v0, the USB connection unconditionally disconnected when the browser tab became hidden and reconnected when the tab became visible again. The status transitioned to `DISCONNECTED` during this time, making it indistinguishable from a real disconnection.

In v1, this behaviour is now:

- **Controllable** — the new `pauseOnHidden` option (default `true`) can be set to `false` to keep the connection open while the tab is hidden. Use this with care: holding the USB interface while the tab is hidden prevents other tabs or applications from connecting to the micro:bit, which can be confusing for users.
- **Observable** — when the connection is paused, the status transitions to `ConnectionStatus.Paused` instead of `Disconnected`, so the UI can distinguish between a temporary pause and a real disconnection.

Reconnection is still automatic when the tab becomes visible again. If reconnection fails (e.g. another process claimed the USB interface), the status transitions to `Disconnected`.

## `MicrobitRadioBridgeConnectionOptions.logging` now optional

Was required in v0, is now optional.
