import { DeviceConnectionEventMap } from "./device.js";

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export const ButtonState = {
  NotPressed: 0,
  ShortPress: 1,
  LongPress: 2,
} as const;

export type ButtonState = (typeof ButtonState)[keyof typeof ButtonState];

export type ButtonEventType = "buttonachanged" | "buttonbchanged";

export interface ButtonData {
  button: "A" | "B";
  state: ButtonState;
}

type FixedArray<T, L extends number> = T[] & { length: L };
type LedRow = FixedArray<boolean, 5>;
export type LedMatrix = FixedArray<LedRow, 5>;

export interface MagnetometerData {
  x: number;
  y: number;
  z: number;
}

export interface UartData {
  value: Uint8Array;
}

/**
 * Events from BLE GATT service notifications (accelerometer, buttons,
 * magnetometer, UART). Used by Bluetooth and radio bridge connections.
 */
export interface ServiceConnectionEventMap {
  accelerometerdatachanged: AccelerometerData;
  buttonachanged: ButtonData;
  buttonbchanged: ButtonData;
  magnetometerdatachanged: MagnetometerData;
  uartdata: UartData;
}

type AllEventMap = ServiceConnectionEventMap & DeviceConnectionEventMap;
export type TypedServiceEvent = keyof AllEventMap;
export type TypedServiceEventDispatcher = <K extends TypedServiceEvent>(
  type: K,
  ...[data]: AllEventMap[K] extends void ? [] : [data: AllEventMap[K]]
) => void;
