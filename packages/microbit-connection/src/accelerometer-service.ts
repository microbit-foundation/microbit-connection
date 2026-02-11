import { BleClient } from "@capacitor-community/bluetooth-le";
import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { Service } from "./bluetooth-device-wrapper.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";
import { profile } from "./bluetooth-profile.js";
import { BackgroundErrorEvent } from "./device.js";

export class AccelerometerService implements Service {
  uuid = profile.accelerometer.id;

  static createService(
    deviceId: string,
    dispatchTypedEvent: TypedServiceEventDispatcher,
  ): AccelerometerService {
    return new AccelerometerService(deviceId, dispatchTypedEvent);
  }

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["accelerometerdatachanged"];
  }

  private dataViewToData(dataView: DataView): AccelerometerData {
    return {
      x: dataView.getInt16(0, true),
      y: dataView.getInt16(2, true),
      z: dataView.getInt16(4, true),
    };
  }

  async getData(): Promise<AccelerometerData> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.accelerometer.id,
      profile.accelerometer.characteristics.data.id,
    );
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.accelerometer.id,
      profile.accelerometer.characteristics.period.id,
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
    // https://lancaster-university.github.io/microbit-docs/ble/profile/#about-the-accelerometer-service
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    await BleClient.write(
      this.deviceId,
      profile.accelerometer.id,
      profile.accelerometer.characteristics.period.id,
      dataView,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    const result = this.characteristicForEvent(type);
    if (result) {
      const { service, characteristic } = result;
      try {
        await BleClient.startNotifications(
          this.deviceId,
          service,
          characteristic,
          (value) => {
            const data = this.dataViewToData(value);
            this.dispatchTypedEvent(
              "accelerometerdatachanged",
              new AccelerometerDataEvent(data),
            );
          },
        );
      } catch (e) {
        this.dispatchTypedEvent(
          "backgrounderror",
          new BackgroundErrorEvent("Failed to start notifications", e),
        );
      }
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    const result = this.characteristicForEvent(type);
    if (result) {
      const { service, characteristic } = result;
      try {
        await BleClient.stopNotifications(
          this.deviceId,
          service,
          characteristic,
        );
      } catch (e) {
        this.dispatchTypedEvent(
          "backgrounderror",
          new BackgroundErrorEvent("Failed to stop notifications", e),
        );
      }
    }
  }

  private characteristicForEvent(type: TypedServiceEvent) {
    switch (type) {
      case "accelerometerdatachanged": {
        return {
          service: profile.accelerometer.id,
          characteristic: profile.accelerometer.characteristics.data.id,
        };
      }
      default: {
        return undefined;
      }
    }
  }
}
