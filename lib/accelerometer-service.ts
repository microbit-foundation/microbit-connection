import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer";
import { profile } from "./bluetooth-profile";
import {
  CharacteristicDataTarget,
  TypedServiceEventDispatcher,
} from "./service-events";

export class AccelerometerService {
  constructor(
    private accelerometerDataCharacteristic: BluetoothRemoteGATTCharacteristic,
    private accelerometerPeriodCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private isNotifying: boolean,
  ) {
    this.addDataEventListener();
    if (this.isNotifying) {
      this.startNotifications();
    }
  }

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    isNotifying: boolean,
  ): Promise<AccelerometerService> {
    const accelerometerService = await gattServer.getPrimaryService(
      profile.accelerometer.id,
    );
    const accelerometerDataCharacteristic =
      await accelerometerService.getCharacteristic(
        profile.accelerometer.characteristics.data.id,
      );
    const accelerometerPeriodCharacteristic =
      await accelerometerService.getCharacteristic(
        profile.accelerometer.characteristics.period.id,
      );
    return new AccelerometerService(
      accelerometerDataCharacteristic,
      accelerometerPeriodCharacteristic,
      dispatcher,
      isNotifying,
    );
  }

  private dataViewToData(dataView: DataView): AccelerometerData {
    return {
      x: dataView.getInt16(0, true),
      y: dataView.getInt16(2, true),
      z: dataView.getInt16(4, true),
    };
  }

  async getData(): Promise<AccelerometerData> {
    const dataView = await this.accelerometerDataCharacteristic.readValue();
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const dataView = await this.accelerometerPeriodCharacteristic.readValue();
    return dataView.getUint16(0, true);
  }

  async setPeriod(value: number): Promise<void> {
    if (value === 0) {
      // Writing 0 causes the device to crash.
      return;
    }
    // Allowed values: 2, 5, 10, 20, 40, 100, 1000
    // Values passed are rounded up to the allowed values on device.
    // Documentation for allowed values looks wrong.
    // https://lancaster-university.github.io/microbit-docs/resources/bluetooth/bluetooth_profile.html
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    await this.accelerometerPeriodCharacteristic.writeValueWithoutResponse(
      dataView,
    );
  }

  private addDataEventListener(): void {
    this.accelerometerDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      (event: Event) => {
        const target = event.target as CharacteristicDataTarget;
        const data = this.dataViewToData(target.value);
        this.dispatchTypedEvent(
          "accelerometerdatachanged",
          new AccelerometerDataEvent(data),
        );
      },
    );
  }

  startNotifications(): void {
    this.accelerometerDataCharacteristic.startNotifications();
    this.isNotifying = true;
  }

  stopNotifications(): void {
    this.isNotifying = false;
    this.accelerometerDataCharacteristic.stopNotifications();
  }
}
