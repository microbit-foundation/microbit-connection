import { DeviceError, DeviceErrorCode } from "../device.js";

/**
 * Maps BLE errors from @capacitor-community/bluetooth-le (and Web Bluetooth)
 * to DeviceError with an appropriate code.
 */
export const mapBleError = (e: unknown): DeviceError => {
  if (e instanceof DeviceError) {
    return e;
  }

  const message = e instanceof Error ? e.message : String(e);
  let code: DeviceErrorCode = "connection-error";

  if (e instanceof Error) {
    // @capacitor-community/bluetooth-le error messages:
    // https://github.com/capacitor-community/bluetooth-le/blob/main/ios/Plugin/DeviceManager.swift
    // https://github.com/capacitor-community/bluetooth-le/blob/main/ios/Plugin/Device.swift
    if (/timeout/i.test(message)) {
      // BleClient throws plain Errors for its own timeouts:
      // "Connection timeout", "Read timeout.", "Write timeout.",
      // "Service discovery timeout.", "Disconnection timeout." etc.
      code = "timeout";
    } else if (/disconnect/i.test(message)) {
      code = "device-disconnected";
    } else if (/permission/i.test(message)) {
      code = "permission-denied";
    }
  }

  return new DeviceError({ code, message, cause: e });
};

/**
 * Wraps an async operation so that any BLE error is mapped to a DeviceError.
 */
export async function withBleErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw mapBleError(e);
  }
}
