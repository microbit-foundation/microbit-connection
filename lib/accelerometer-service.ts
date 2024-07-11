import {
  Accelerometer,
  AccelerometerData,
  AccelerometerDataEvent,
  AccelerometerEventMap,
} from "./accelerometer";
import { profile } from "./bluetooth-profile";
import { TypedEventTarget } from "./events";

export type CharacteristicDataTarget = EventTarget & {
  value: DataView;
};

export class AccelerometerService
  extends TypedEventTarget<AccelerometerEventMap>
  implements Accelerometer
{
  private static accelerometerInstance: AccelerometerService | undefined;

  constructor(
    private accelerometerDataCharacteristic: BluetoothRemoteGATTCharacteristic,
    // @ts-ignore temporarily unused characteristic
    private accelerometerPeriodCharacteristic: BluetoothRemoteGATTCharacteristic
  ) {
    super();
    this.accelerometerDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.dataListener
    );
  }

  static async init(gattServer: BluetoothRemoteGATTServer) {
    if (this.accelerometerInstance) {
      return this.accelerometerInstance;
    }
    const accelerometerService = await gattServer.getPrimaryService(
      profile.accelerometer.id
    );
    const accelerometerDataCharacteristic =
      await accelerometerService.getCharacteristic(
        profile.accelerometer.characteristics.data.id
      );
    const accelerometerPeriodCharacteristic =
      await accelerometerService.getCharacteristic(
        profile.accelerometer.characteristics.period.id
      );
    this.accelerometerInstance = new AccelerometerService(
      accelerometerDataCharacteristic,
      accelerometerPeriodCharacteristic
    );
    return this.accelerometerInstance;
  }

  async getData(): Promise<AccelerometerData> {
    const dataView = await this.accelerometerDataCharacteristic.readValue();
    const data = this.dataViewToData(dataView);
    return data;
  }

  private dataViewToData(dataView: DataView): AccelerometerData {
    return {
      x: dataView.getInt16(0, true),
      y: dataView.getInt16(2, true),
      z: dataView.getInt16(4, true),
    };
  }

  private dataListener = (event: Event) => {
    const target = event.target as CharacteristicDataTarget;
    const data = this.dataViewToData(target.value);
    this.dispatchTypedEvent(
      "accelerometerdatachanged",
      new AccelerometerDataEvent(data)
    );
  };

  startNotifications() {
    this.accelerometerDataCharacteristic.startNotifications();
  }

  stopNotifications() {
    this.accelerometerDataCharacteristic.stopNotifications();
  }
}
