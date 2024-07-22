import { AccelerometerDataEvent } from "./accelerometer.js";
import { ButtonEvent } from "./buttons.js";
import { DeviceConnectionEventMap } from "./device.js";

export class ServiceConnectionEventMap {
  "accelerometerdatachanged": AccelerometerDataEvent;
  "buttonachanged": ButtonEvent;
  "buttonbchanged": ButtonEvent;
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
