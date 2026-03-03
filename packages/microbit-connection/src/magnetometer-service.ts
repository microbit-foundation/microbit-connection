import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { MagnetometerData } from "./magnetometer.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class MagnetometerService implements Service {
  uuid = profile.magnetometer.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["magnetometerdatachanged"];
  }

  private dataViewToData(dataView: DataView): MagnetometerData {
    return {
      x: dataView.getInt16(0, true),
      y: dataView.getInt16(2, true),
      z: dataView.getInt16(4, true),
    };
  }

  async getData(): Promise<MagnetometerData> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.magnetometer.id,
      profile.magnetometer.characteristics.data.id,
    );
    return this.dataViewToData(dataView);
  }

  async getPeriod(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.magnetometer.id,
      profile.magnetometer.characteristics.period.id,
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
    await BleClient.write(
      this.deviceId,
      profile.magnetometer.id,
      profile.magnetometer.characteristics.period.id,
      dataView,
    );
  }

  async getBearing(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.magnetometer.id,
      profile.magnetometer.characteristics.bearing.id,
    );
    return dataView.getUint16(0, true);
  }

  async triggerCalibration(): Promise<void> {
    const dataView = new DataView(new ArrayBuffer(1));
    dataView.setUint8(0, 1);
    await BleClient.write(
      this.deviceId,
      profile.magnetometer.id,
      profile.magnetometer.characteristics.calibration.id,
      dataView,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type === "magnetometerdatachanged") {
      try {
        await BleClient.startNotifications(
          this.deviceId,
          profile.magnetometer.id,
          profile.magnetometer.characteristics.data.id,
          (value: DataView) => {
            const data = this.dataViewToData(value);
            this.dispatchTypedEvent("magnetometerdatachanged", data);
          },
        );
      } catch (e) {
        this.dispatchTypedEvent("backgrounderror", {
          message: "Failed to start notifications",
          error: e,
        });
      }
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (type === "magnetometerdatachanged") {
      try {
        await BleClient.stopNotifications(
          this.deviceId,
          profile.magnetometer.id,
          profile.magnetometer.characteristics.data.id,
        );
      } catch (e) {
        this.dispatchTypedEvent("backgrounderror", {
          message: "Failed to stop notifications",
          error: e,
        });
      }
    }
  }
}
