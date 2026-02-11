import { AccelerometerDataEvent } from "./accelerometer.js";
import { ButtonEvent } from "./buttons.js";
import { DeviceConnectionEventMap } from "./device.js";
import { MagnetometerDataEvent } from "./magnetometer.js";
import { UARTDataEvent } from "./uart.js";

export class ServiceConnectionEventMap {
  "accelerometerdatachanged": AccelerometerDataEvent;
  "buttonachanged": ButtonEvent;
  "buttonbchanged": ButtonEvent;
  "magnetometerdatachanged": MagnetometerDataEvent;
  "uartdata": UARTDataEvent;
}

export type CharacteristicDataTarget = EventTarget & {
  value: DataView;
};

export type TypedServiceEvent = keyof (ServiceConnectionEventMap &
  DeviceConnectionEventMap);

export type TypedServiceEventDispatcher = (
  _type: TypedServiceEvent,
  event: (ServiceConnectionEventMap &
    DeviceConnectionEventMap)[TypedServiceEvent],
) => boolean;
