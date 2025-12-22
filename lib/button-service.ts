import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { ButtonEvent, ButtonState } from "./buttons.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";
import { BackgroundErrorEvent } from "./device.js";

export class ButtonService implements Service {
  uuid = profile.button.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["buttonachanged", "buttonbchanged"];
  }

  private dataViewToButtonState(dataView: DataView): ButtonState {
    return dataView.getUint8(0);
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    switch (type) {
      case "buttonachanged":
      case "buttonbchanged": {
        try {
          await BleClient.startNotifications(
            this.deviceId,
            profile.button.id,
            this.characteristicForButtonEventType(type).id,
            (value) => {
              const data = this.dataViewToButtonState(value);
              this.dispatchTypedEvent(type, new ButtonEvent(type, data));
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
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    switch (type) {
      case "buttonachanged":
      case "buttonbchanged": {
        await BleClient.stopNotifications(
          this.deviceId,
          profile.button.id,
          this.characteristicForButtonEventType(type).id,
        );
      }
    }
  }

  private characteristicForButtonEventType(
    type: "buttonachanged" | "buttonbchanged",
  ) {
    return type === "buttonachanged"
      ? profile.button.characteristics.a
      : profile.button.characteristics.b;
  }
}
