import { AccelerometerDataEvent } from "./accelerometer.js";

export class ServiceConnectionEventMap {
  "accelerometerdatachanged": AccelerometerDataEvent;
}

export type CharacteristicDataTarget = EventTarget & {
  value: DataView;
};

export type TypedServiceEvent = keyof ServiceConnectionEventMap;

export type TypedServiceEventDispatcher = (
  _type: TypedServiceEvent,
  event: ServiceConnectionEventMap[TypedServiceEvent],
) => boolean;
