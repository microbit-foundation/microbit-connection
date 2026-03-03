import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class UARTService implements Service {
  uuid = profile.uart.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["uartdata"];
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type === "uartdata") {
      try {
        await BleClient.startNotifications(
          this.deviceId,
          profile.uart.id,
          profile.uart.characteristics.tx.id,
          (value: DataView) => {
            this.dispatchTypedEvent("uartdata", {
              value: new Uint8Array(value.buffer),
            });
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
    if (type === "uartdata") {
      await BleClient.stopNotifications(
        this.deviceId,
        profile.uart.id,
        profile.uart.characteristics.tx.id,
      );
    }
  }

  async writeData(value: Uint8Array): Promise<void> {
    const dataView = new DataView(value.buffer);
    await BleClient.writeWithoutResponse(
      this.deviceId,
      profile.uart.id,
      profile.uart.characteristics.rx.id,
      dataView,
    );
  }
}
