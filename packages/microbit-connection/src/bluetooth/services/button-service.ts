import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "../device-wrapper.js";
import { profile } from "../profile.js";
import {
  ButtonState,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../../service-events.js";
import { mapBleError } from "../ble-error.js";

export class ButtonService implements Service {
  uuid = profile.button.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["buttonachanged", "buttonbchanged"];
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
              const state = value.getUint8(0) as ButtonState;
              this.dispatchTypedEvent(type, {
                button: type === "buttonachanged" ? "A" : "B",
                state,
              });
            },
          );
        } catch (e) {
          this.dispatchTypedEvent("backgrounderror", {
            error: mapBleError(e),
            event: type,
          });
        }
      }
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    switch (type) {
      case "buttonachanged":
      case "buttonbchanged": {
        try {
          await BleClient.stopNotifications(
            this.deviceId,
            profile.button.id,
            this.characteristicForButtonEventType(type).id,
          );
        } catch (e) {
          this.dispatchTypedEvent("backgrounderror", {
            error: mapBleError(e),
            event: type,
          });
        }
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
