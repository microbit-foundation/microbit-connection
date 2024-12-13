import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import {
  CharacteristicDataTarget,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";
import { UARTDataEvent } from "./uart.js";

export class UARTService implements Service {
  constructor(
    private txCharacteristic: BluetoothRemoteGATTCharacteristic,
    private rxCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
  ) {
    this.txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      (event: Event) => {
        const target = event.target as CharacteristicDataTarget;
        const value = new Uint8Array(target.value.buffer);
        this.dispatchTypedEvent("uartdata", new UARTDataEvent(value));
      },
    );
  }

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<UARTService | undefined> {
    let uartService: BluetoothRemoteGATTService;
    try {
      uartService = await gattServer.getPrimaryService(profile.uart.id);
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
    const rxCharacteristic = await uartService.getCharacteristic(
      profile.uart.characteristics.rx.id,
    );
    const txCharacteristic = await uartService.getCharacteristic(
      profile.uart.characteristics.tx.id,
    );
    return new UARTService(
      rxCharacteristic,
      txCharacteristic,
      dispatcher,
      queueGattOperation,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type === "uartdata") {
      await this.txCharacteristic.startNotifications();
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (type === "uartdata") {
      await this.txCharacteristic.stopNotifications();
    }
  }

  async writeData(value: Uint8Array): Promise<void> {
    const dataView = new DataView(value.buffer);
    return this.queueGattOperation(() =>
      this.rxCharacteristic.writeValueWithoutResponse(dataView),
    );
  }
}
