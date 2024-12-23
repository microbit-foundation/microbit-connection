import { MagnetometerData, MagnetometerDataEvent } from "./magnetometer.js";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import {
  CharacteristicDataTarget,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class MagnetometerService implements Service {
  constructor(
    private magnetometerDataCharacteristic: BluetoothRemoteGATTCharacteristic,
    private magnetometerPeriodCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
  ) {
    this.magnetometerDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      (event: Event) => {
        const target = event.target as CharacteristicDataTarget;
        const data = this.dataViewToData(target.value);
        this.dispatchTypedEvent(
          "magnetometerdatachanged",
          new MagnetometerDataEvent(data),
        );
      },
    );
  }

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<MagnetometerService | undefined> {
    let magnetometerService: BluetoothRemoteGATTService;
    try {
      magnetometerService = await gattServer.getPrimaryService(
        profile.magnetometer.id,
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
    const magnetometerDataCharacteristic =
      await magnetometerService.getCharacteristic(
        profile.magnetometer.characteristics.data.id,
      );
    const magnetometerPeriodCharacteristic =
      await magnetometerService.getCharacteristic(
        profile.magnetometer.characteristics.period.id,
      );
    return new MagnetometerService(
      magnetometerDataCharacteristic,
      magnetometerPeriodCharacteristic,
      dispatcher,
      queueGattOperation,
    );
  }

  private dataViewToData(dataView: DataView): MagnetometerData {
    return {
      x: dataView.getInt16(0, true),
      y: dataView.getInt16(2, true),
      z: dataView.getInt16(4, true),
    };
  }

  async getData(): Promise<MagnetometerData> {
    const dataView = await this.queueGattOperation(() =>
      this.magnetometerDataCharacteristic.readValue(),
    );
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const dataView = await this.queueGattOperation(() =>
      this.magnetometerPeriodCharacteristic.readValue(),
    );
    return dataView.getUint16(0, true);
  }

  async setPeriod(value: number): Promise<void> {
    if (value === 0) {
      // Writing 0 causes the device to crash.
      return;
    }
    // Allowed values: 10, 20, 50, 100
    // Values passed are rounded up to the allowed values on device.
    // Documentation for allowed values looks wrong.
    // https://lancaster-university.github.io/microbit-docs/ble/profile/#about-the-magnetometer-service
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    return this.queueGattOperation(() =>
      this.magnetometerPeriodCharacteristic.writeValue(dataView),
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
      case "magnetometerdatachanged": {
        return this.magnetometerDataCharacteristic;
      }
      default: {
        return undefined;
      }
    }
  }
}
