import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { GattOperation } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { createGattOperationPromise } from "./bluetooth-utils.js";
import {
  CharacteristicDataTarget,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class AccelerometerService {
  constructor(
    private accelerometerDataCharacteristic: BluetoothRemoteGATTCharacteristic,
    private accelerometerPeriodCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private isNotifying: boolean,
    private queueGattOperation: (gattOperation: GattOperation) => void,
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
    queueGattOperation: (gattOperation: GattOperation) => void,
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
      queueGattOperation,
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
    const { gattOperation, gattOperationPromise } = createGattOperationPromise(
      () => this.accelerometerDataCharacteristic.readValue(),
    );
    this.queueGattOperation(gattOperation);
    const dataView = await gattOperationPromise;
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const { gattOperation, gattOperationPromise } = createGattOperationPromise(
      () => this.accelerometerPeriodCharacteristic.readValue(),
    );
    this.queueGattOperation(gattOperation);
    const dataView = await gattOperationPromise;
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
    this.queueGattOperation(() =>
      this.accelerometerPeriodCharacteristic.writeValueWithoutResponse(
        dataView,
      ),
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
