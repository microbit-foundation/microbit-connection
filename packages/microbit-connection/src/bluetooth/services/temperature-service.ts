import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "../device-wrapper.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../../service-events.js";
import { profile } from "../profile.js";
import { mapBleError } from "../ble-error.js";

export class TemperatureService implements Service {
  uuid = profile.temperature.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["temperaturechanged"];
  }

  async getData(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.temperature.id,
      profile.temperature.characteristics.data.id,
    );
    return dataView.getInt8(0);
  }

  async getPeriod(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.temperature.id,
      profile.temperature.characteristics.period.id,
    );
    return dataView.getUint16(0, true);
  }

  async setPeriod(value: number): Promise<void> {
    if (value === 0) {
      return;
    }
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    await BleClient.write(
      this.deviceId,
      profile.temperature.id,
      profile.temperature.characteristics.period.id,
      dataView,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "temperaturechanged") {
      return;
    }
    try {
      await BleClient.startNotifications(
        this.deviceId,
        profile.temperature.id,
        profile.temperature.characteristics.data.id,
        (value) => {
          const celsius = value.getInt8(0);
          this.dispatchTypedEvent("temperaturechanged", { celsius });
        },
      );
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "temperaturechanged") {
      return;
    }
    try {
      await BleClient.stopNotifications(
        this.deviceId,
        profile.temperature.id,
        profile.temperature.characteristics.data.id,
      );
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }
}
