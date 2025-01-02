export interface MagnetometerData {
  x: number;
  y: number;
  z: number;
}

export class MagnetometerDataEvent extends Event {
  constructor(public readonly data: MagnetometerData) {
    super("magnetometerdatachanged");
  }
}
