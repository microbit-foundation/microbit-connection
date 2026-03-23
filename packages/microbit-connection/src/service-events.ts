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

export interface TemperatureData {
  celsius: number;
}

export interface PinValue {
  /** Pin number (0-18). */
  pin: number;
  /**
   * Pin value. For digital pins: 0 or 1.
   * For analog pins: 0-255 (the 10-bit analog reading scaled to 8 bits).
   */
  value: number;
}

/**
 * Data from a `pinchanged` event.
 *
 * Contains only the input pins whose values changed since the last
 * notification, up to a firmware limit of 10 pins per event
 * (lowest-numbered first). Use {@link MicrobitBluetoothConnection.readPins}
 * to read all input pins on demand.
 */
export interface PinData {
  data: PinValue[];
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
  temperaturechanged: TemperatureData;
  pinchanged: PinData;
  uartdata: UartData;
}

type AllEventMap = ServiceConnectionEventMap & DeviceConnectionEventMap;
export type TypedServiceEvent = keyof AllEventMap;
export type TypedServiceEventDispatcher = <K extends TypedServiceEvent>(
  type: K,
  ...[data]: AllEventMap[K] extends void ? [] : [data: AllEventMap[K]]
) => void;
