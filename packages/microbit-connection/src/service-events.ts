import { DeviceConnectionEventMap } from "./device.js";

/**
 * An event from the micro:bit's message bus, received via the BLE
 * Event Service.
 */
export interface MicrobitEvent {
  /** Event source ID (e.g. 1 for button A, 4 for accelerometer). */
  source: number;
  /** Event value (e.g. 3 for click). 0 is used as a wildcard when registering. */
  value: number;
}

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

/**
 * A 5x5 boolean matrix representing the micro:bit LED display.
 * Each inner array is a row of 5 booleans (left to right),
 * and there are 5 rows (top to bottom).
 */
export type LedMatrix = boolean[][];

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
  microbitevent: MicrobitEvent;
  uartdata: UartData;
}

type AllEventMap = ServiceConnectionEventMap & DeviceConnectionEventMap;
export type TypedServiceEvent = keyof AllEventMap;
export type TypedServiceEventDispatcher = <K extends TypedServiceEvent>(
  type: K,
  ...[data]: AllEventMap[K] extends void ? [] : [data: AllEventMap[K]]
) => void;
