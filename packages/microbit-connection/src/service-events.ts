import { AccelerometerData } from "./accelerometer.js";
import { ButtonData } from "./buttons.js";
import { DeviceConnectionEventMap } from "./device.js";
import { MagnetometerData } from "./magnetometer.js";

export interface UartData {
  value: Uint8Array;
}

export interface ServiceConnectionEventMap {
  accelerometerdatachanged: AccelerometerData;
  buttonachanged: ButtonData;
  buttonbchanged: ButtonData;
  magnetometerdatachanged: MagnetometerData;
  uartdata: UartData;
}

export type CharacteristicDataTarget = EventTarget & {
  value: DataView;
};

type AllEventMap = ServiceConnectionEventMap & DeviceConnectionEventMap;
export type TypedServiceEvent = keyof AllEventMap;
export type TypedServiceEventDispatcher = <K extends TypedServiceEvent>(
  type: K,
  ...[data]: AllEventMap[K] extends void ? [] : [data: AllEventMap[K]]
) => void;
