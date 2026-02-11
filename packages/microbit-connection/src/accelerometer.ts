export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export class AccelerometerDataEvent extends Event {
  constructor(public readonly data: AccelerometerData) {
    super("accelerometerdatachanged");
  }
}
