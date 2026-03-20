import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "../device-wrapper.js";
import { profile } from "../profile.js";
import {
  MicrobitEvent,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../../service-events.js";
import { mapBleError } from "../ble-error.js";

export class EventService implements Service {
  uuid = profile.event.id;

  /**
   * Filters that have been written to Client Requirements on the current
   * connection. Tracked so we can avoid duplicate writes and replay on
   * reconnect.
   */
  private registeredFilters = new Set<string>();

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["microbitevent"];
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "microbitevent") {
      return;
    }
    // Clear tracked filters — the micro:bit wiped its listeners on
    // disconnect so we need to re-register them.
    this.registeredFilters.clear();
    console.log(
      "[EventService] startNotifications: subscribing to microBitEvent characteristic",
    );
    try {
      await BleClient.startNotifications(
        this.deviceId,
        profile.event.id,
        profile.event.characteristics.microBitEvent.id,
        (value: DataView) => {
          const hex = Array.from(
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
          console.log(
            `[EventService] notification raw: ${hex} (${value.byteLength} bytes)`,
          );
          // Each notification is 4 bytes: source (uint16 LE) + value (uint16 LE)
          for (let offset = 0; offset + 4 <= value.byteLength; offset += 4) {
            const source = value.getUint16(offset, true);
            const eventValue = value.getUint16(offset + 2, true);
            console.log(
              `[EventService] dispatching microbitevent: source=${source}, value=${eventValue}`,
            );
            this.dispatchTypedEvent("microbitevent", {
              source,
              value: eventValue,
            });
          }
        },
      );
      console.log("[EventService] startNotifications: subscribed successfully");
    } catch (e) {
      console.error("[EventService] startNotifications failed:", e);
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "microbitevent") {
      return;
    }
    try {
      await BleClient.stopNotifications(
        this.deviceId,
        profile.event.id,
        profile.event.characteristics.microBitEvent.id,
      );
      this.registeredFilters.clear();
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  /**
   * Write event filters to Client Requirements so the micro:bit knows
   * which events to forward. Additive — the micro:bit accumulates
   * filters until disconnect.
   */
  async registerFilters(filters: MicrobitEvent[]): Promise<void> {
    const newFilters = filters.filter(
      (f) => !this.registeredFilters.has(filterKey(f)),
    );
    if (newFilters.length === 0) {
      return;
    }

    // The micro:bit's Client Requirements characteristic accepts exactly
    // one 4-byte filter per write, so we must write each filter separately.
    for (const f of newFilters) {
      console.log(
        `[EventService] registerFilter: writing source=${f.source}, value=${f.value}`,
      );
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint16(0, f.source, true);
      view.setUint16(2, f.value, true);

      try {
        await BleClient.write(
          this.deviceId,
          profile.event.id,
          profile.event.characteristics.clientRequirements.id,
          view,
        );
        console.log(
          `[EventService] registerFilter: write succeeded for source=${f.source}, value=${f.value}`,
        );
      } catch (e) {
        console.error(
          `[EventService] registerFilter: write failed for source=${f.source}, value=${f.value}`,
          e,
        );
        this.dispatchTypedEvent("backgrounderror", {
          error: mapBleError(e),
          event: "microbitevent",
        });
        return;
      }

      this.registeredFilters.add(filterKey(f));
    }
    console.log(`[EventService] registerFilters done. Tracked filters:`, [
      ...this.registeredFilters,
    ]);
  }

  /**
   * Send events to the micro:bit's message bus.
   */
  async sendEvents(events: MicrobitEvent[]): Promise<void> {
    // The micro:bit's Client Event characteristic accepts one 4-byte
    // event per write.
    for (const e of events) {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint16(0, e.source, true);
      view.setUint16(2, e.value, true);

      await BleClient.writeWithoutResponse(
        this.deviceId,
        profile.event.id,
        profile.event.characteristics.clientEvent.id,
        view,
      );
    }
  }
}

const filterKey = (f: MicrobitEvent): string => `${f.source}:${f.value}`;
