import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { ButtonEvent, ButtonState } from "./buttons.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import {
  CharacteristicDataTarget,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class ButtonService implements Service {
  constructor(
    private buttonACharacteristic: BluetoothRemoteGATTCharacteristic,
    private buttonBCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {
    for (const type of ["buttonachanged", "buttonbchanged"] as const) {
      this.characteristicForEvent(type)?.addEventListener(
        "characteristicvaluechanged",
        (event: Event) => {
          const target = event.target as CharacteristicDataTarget;
          const data = this.dataViewToButtonState(target.value);
          this.dispatchTypedEvent(type, new ButtonEvent(type, data));
        },
      );
    }
  }

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<ButtonService | undefined> {
    let buttonService: BluetoothRemoteGATTService;
    try {
      buttonService = await gattServer.getPrimaryService(profile.button.id);
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
    const buttonACharacteristic = await buttonService.getCharacteristic(
      profile.button.characteristics.a.id,
    );
    const buttonBCharacteristic = await buttonService.getCharacteristic(
      profile.button.characteristics.b.id,
    );
    return new ButtonService(
      buttonACharacteristic,
      buttonBCharacteristic,
      dispatcher,
    );
  }

  private dataViewToButtonState(dataView: DataView): ButtonState {
    return dataView.getUint8(0);
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    await this.characteristicForEvent(type)?.startNotifications();
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    await this.characteristicForEvent(type)?.stopNotifications();
  }

  private characteristicForEvent(type: TypedServiceEvent) {
    switch (type) {
      case "buttonachanged": {
        return this.buttonACharacteristic;
      }
      case "buttonbchanged": {
        return this.buttonBCharacteristic;
      }
      default: {
        return undefined;
      }
    }
  }
}
