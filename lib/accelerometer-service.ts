import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { GattOperation, Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { createGattOperationPromise } from "./bluetooth-utils.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import {
  CharacteristicDataTarget,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class AccelerometerService implements Service {
  constructor(
    private accelerometerDataCharacteristic: BluetoothRemoteGATTCharacteristic,
    private accelerometerPeriodCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private queueGattOperation: (gattOperation: GattOperation) => void,
  ) {
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

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: (gattOperation: GattOperation) => void,
    listenerInit: boolean,
  ): Promise<AccelerometerService | undefined> {
    let accelerometerService: BluetoothRemoteGATTService;
    try {
      accelerometerService = await gattServer.getPrimaryService(
        profile.accelerometer.id,
      );
    } catch (err) {
      if (listenerInit) {
        dispatcher("backgrounderror", new BackgroundErrorEvent(err as string));
        return;
      } else {
        throw new DeviceError({
          code: "service-missing",
          message: err as string,
        });
      }
    }
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
    const { callback, gattOperationPromise } = createGattOperationPromise();
    this.queueGattOperation({
      callback,
      operation: () => this.accelerometerDataCharacteristic.readValue(),
    });
    const dataView = (await gattOperationPromise) as DataView;
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const { callback, gattOperationPromise } = createGattOperationPromise();
    this.queueGattOperation({
      callback,
      operation: () => this.accelerometerPeriodCharacteristic.readValue(),
    });
    const dataView = (await gattOperationPromise) as DataView;
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
    const { callback } = createGattOperationPromise();
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    this.queueGattOperation({
      callback,
      operation: () =>
        this.accelerometerPeriodCharacteristic.writeValueWithoutResponse(
          dataView,
        ),
    });
  }

  private addDataEventListener(): void {}

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    this.characteristicForEvent(type)?.startNotifications();
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    this.characteristicForEvent(type)?.stopNotifications();
  }

  private characteristicForEvent(type: TypedServiceEvent) {
    switch (type) {
      case "accelerometerdatachanged": {
        return this.accelerometerDataCharacteristic;
      }
      default: {
        return undefined;
      }
    }
  }
}
