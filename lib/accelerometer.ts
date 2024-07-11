import { TypedEventTarget } from "./events";

export interface Accelerometer extends TypedEventTarget<AccelerometerEventMap> {
  getData: () => Promise<AccelerometerData>;
  startNotifications: () => void;
  stopNotifications: () => void;
}

export class AccelerometerDataEvent extends Event {
  constructor(public readonly data: AccelerometerData) {
    super("accelerometerdatachanged");
  }
}

export class AccelerometerEventMap {
  "accelerometerdatachanged": AccelerometerDataEvent;
}

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}
