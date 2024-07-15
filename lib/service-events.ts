import { AccelerometerDataEvent } from "./accelerometer.js";
import { DeviceConnectionEventMap } from "./device.js";

export class ServiceConnectionEventMap {
  "accelerometerdatachanged": AccelerometerDataEvent;
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
