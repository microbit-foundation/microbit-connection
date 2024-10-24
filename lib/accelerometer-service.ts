import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
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
    private queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
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
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
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
    const dataView = await this.queueGattOperation(() =>
      this.accelerometerDataCharacteristic.readValue(),
    );
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const dataView = await this.queueGattOperation(() =>
      this.accelerometerPeriodCharacteristic.readValue(),
    );
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
    return this.queueGattOperation(() =>
      this.accelerometerPeriodCharacteristic.writeValueWithoutResponse(
        dataView,
      ),
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    await this.characteristicForEvent(type)?.startNotifications();
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    await this.characteristicForEvent(type)?.stopNotifications();
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
