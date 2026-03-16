import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

export class EventService implements Service {
  constructor(
    private clientRequirementsCharacteristic: BluetoothRemoteGATTCharacteristic,
    private microBitEventCharacteristic: BluetoothRemoteGATTCharacteristic,
    private clientEventCharacteristic: BluetoothRemoteGATTCharacteristic,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
  ) {
    this.characteristicForEvent("microbitevents")?.addEventListener(
      "characteristicvaluechanged",
      (event: Event) => {
        const char = event.target as BluetoothRemoteGATTCharacteristic;
        const view = char.value!;
        const eventType = view.getUint16(0, true);
        const eventValue = view.getUint16(2, true);
        console.log("microbit event", { eventType, eventValue });
        this.dispatchTypedEvent(
          "microbitevents",
          new CustomEvent("microbitevents", {
            detail: { eventType, eventValue },
          }),
        );
      },
    );
    console.log("listener added!!");
  }

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<EventService | undefined> {
    let eventService: BluetoothRemoteGATTService;
    try {
      eventService = await gattServer.getPrimaryService(profile.event.id);
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
    const microBitEvent = await eventService.getCharacteristic(
      profile.event.characteristics.microBitEvent.id,
    );
    const clientRequirements = await eventService.getCharacteristic(
      profile.event.characteristics.clientRequirements.id,
    );
    const clientEvent = await eventService.getCharacteristic(
      profile.event.characteristics.clientEvent.id,
    );
    console.log(
      "Created event service",
      microBitEvent,
      clientRequirements,
      clientEvent,
    );
    return new EventService(
      clientRequirements,
      microBitEvent,
      clientEvent,
      dispatcher,
      queueGattOperation,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    console.log("start notifications!!");
    await this.characteristicForEvent(type)?.startNotifications();
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    await this.characteristicForEvent(type)?.stopNotifications();
  }

  private characteristicForEvent(type: TypedServiceEvent) {
    switch (type) {
      case "microbitevents": {
        return this.microBitEventCharacteristic;
      }
      case "clientevents": {
        return this.clientEventCharacteristic;
      }
      default: {
        return undefined;
      }
    }
  }

  async writeClientRequirements() {
    console.log("write client requirements!");
    // Build a list of (event_type, event_value) pairs — 4 bytes each, little-endian
    // We want DEVICE_ID_GESTURE (13 = 0x000D), any value (0 = wildcard)
    const buf = new ArrayBuffer(4); // two structs
    const view = new DataView(buf);
    view.setUint16(0, 13, true); // DEVICE_ID_GESTURE
    view.setUint16(2, 0, true); // any value
    return this.queueGattOperation(() =>
      this.clientRequirementsCharacteristic.writeValueWithoutResponse(view),
    );
  }

  async read() {
    await this.queueGattOperation(() =>
      this.microBitEventCharacteristic.readValue(),
    );
  }
}
