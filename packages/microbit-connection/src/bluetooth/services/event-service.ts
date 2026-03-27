import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "../device-wrapper.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../../service-events.js";
import { profile } from "../profile.js";
import { mapBleError } from "../ble-error.js";
import { BoardVersion } from "../../device.js";
import {
  EventSource,
  V2Source,
  type GestureEvent,
  type ButtonAction,
} from "../../microbit-events.js";

type VersionSource = (typeof EventSource)["v1"] | (typeof EventSource)["v2"];

const NAMED_EVENTS = [
  "gesturechanged",
  "buttonaaction",
  "buttonbaction",
  "buttonabaction",
  "logoaction",
] as const;

type NamedEvent = (typeof NAMED_EVENTS)[number];

function isNamedEvent(type: string): type is NamedEvent {
  return (NAMED_EVENTS as readonly string[]).includes(type);
}

export class EventService implements Service {
  uuid = profile.event.id;

  private activeEventTypes = new Set<string>();
  /**
   * Filters registered via named events (gestures, buttons), keyed as "source:value".
   * Persists across reconnects so we can replay them.
   */
  private namedRequirements = new Set<string>();
  /**
   * Filters registered via explicit {@link subscribeToEvent} calls, keyed as "source:value".
   * Only events matching these are dispatched as `microbitevent`.
   * Persists across reconnects so we can replay them.
   */
  private explicitSubscriptions = new Set<string>();
  /**
   * Tracks which named event types contributed which filter keys,
   * so we can clean up when a named event is stopped.
   */
  private namedEventFilters = new Map<string, string[]>();

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private getBoardVersion: () => BoardVersion | undefined,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return [
      "gesturechanged",
      "buttonaaction",
      "buttonbaction",
      "buttonabaction",
      "logoaction",
      "microbitevent",
    ];
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (!this.getRelevantEvents().includes(type)) {
      return;
    }
    this.activeEventTypes.add(type);

    try {
      // Always (re-)register the BLE notification. After a reconnect the
      // previous subscription is gone even though the service instance is
      // reused, so we cannot skip this.
      await BleClient.startNotifications(
        this.deviceId,
        profile.event.id,
        profile.event.characteristics.microBitEvent.id,
        (value) => this.handleNotification(value),
      );

      if (isNamedEvent(type)) {
        this.writeRequirementsForNamedEvent(type);
      }

      // Replay all filters (handles reconnect case where the micro:bit
      // has lost its listener registrations).
      await this.replayAllRequirements();
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (!this.getRelevantEvents().includes(type)) {
      return;
    }
    this.activeEventTypes.delete(type);

    // Remove filters contributed by this named event type
    if (isNamedEvent(type)) {
      const keys = this.namedEventFilters.get(type) ?? [];
      for (const key of keys) {
        this.namedRequirements.delete(key);
      }
      this.namedEventFilters.delete(type);
    }

    if (this.activeEventTypes.size === 0) {
      try {
        await BleClient.stopNotifications(
          this.deviceId,
          profile.event.id,
          profile.event.characteristics.microBitEvent.id,
        );
      } catch (e) {
        this.dispatchTypedEvent("backgrounderror", {
          error: mapBleError(e),
          event: type,
        });
      }
    }
  }

  /**
   * Register interest in a specific micro:bit message bus event.
   * Tells the micro:bit to forward matching message bus traffic over BLE.
   * Matching events are dispatched as `microbitevent`.
   * Use 0 as the value to match all events from a source.
   */
  async subscribeToEvent(source: number, value: number): Promise<void> {
    const key = filterKey(source, value);
    if (!this.explicitSubscriptions.has(key)) {
      this.explicitSubscriptions.add(key);
      await this.writeClientRequirement(source, value);
    }
  }

  /**
   * Send an event to the micro:bit's message bus.
   */
  async sendEvent(source: number, value: number): Promise<void> {
    const data = new DataView(new ArrayBuffer(4));
    data.setUint16(0, source, true);
    data.setUint16(2, value, true);
    await BleClient.writeWithoutResponse(
      this.deviceId,
      profile.event.id,
      profile.event.characteristics.clientEvent.id,
      data,
    );
  }

  private handleNotification(dataView: DataView): void {
    for (let offset = 0; offset + 4 <= dataView.byteLength; offset += 4) {
      const source = dataView.getUint16(offset, true);
      const value = dataView.getUint16(offset + 2, true);

      if (
        this.activeEventTypes.has("microbitevent") &&
        this.matchesExplicitSubscription(source, value)
      ) {
        this.dispatchTypedEvent("microbitevent", { source, value });
      }

      this.demuxToNamedEvents(source, value);
    }
  }

  private demuxToNamedEvents(source: number, value: number): void {
    const src = this.getSourceIds();
    if (!src) return;

    if (source === src.Gesture && this.activeEventTypes.has("gesturechanged")) {
      this.dispatchTypedEvent("gesturechanged", {
        gesture: value as GestureEvent,
      });
    }
    if (source === src.ButtonA && this.activeEventTypes.has("buttonaaction")) {
      this.dispatchTypedEvent("buttonaaction", {
        button: "A",
        action: value as ButtonAction,
      });
    }
    if (source === src.ButtonB && this.activeEventTypes.has("buttonbaction")) {
      this.dispatchTypedEvent("buttonbaction", {
        button: "B",
        action: value as ButtonAction,
      });
    }
    if (
      source === src.ButtonAB &&
      this.activeEventTypes.has("buttonabaction")
    ) {
      this.dispatchTypedEvent("buttonabaction", {
        button: "AB",
        action: value as ButtonAction,
      });
    }
    if (source === V2Source.Logo && this.activeEventTypes.has("logoaction")) {
      this.dispatchTypedEvent("logoaction", {
        button: "Logo",
        action: value as ButtonAction,
      });
    }
  }

  private writeRequirementsForNamedEvent(type: NamedEvent): void {
    const src = this.getSourceIds();
    if (!src) return;

    const filters: Array<[number, number]> = [];
    switch (type) {
      case "gesturechanged":
        filters.push([src.Gesture, 0]);
        break;
      case "buttonaaction":
        filters.push([src.ButtonA, 0]);
        break;
      case "buttonbaction":
        filters.push([src.ButtonB, 0]);
        break;
      case "buttonabaction":
        filters.push([src.ButtonAB, 0]);
        break;
      case "logoaction":
        filters.push([V2Source.Logo, 0]);
        break;
    }

    const keys: string[] = [];
    for (const [source, value] of filters) {
      const key = filterKey(source, value);
      keys.push(key);
      this.namedRequirements.add(key);
    }
    this.namedEventFilters.set(type, keys);
  }

  private matchesExplicitSubscription(source: number, value: number): boolean {
    if (this.explicitSubscriptions.has(filterKey(source, value))) return true;
    if (this.explicitSubscriptions.has(filterKey(source, 0))) return true;
    return false;
  }

  private async replayAllRequirements(): Promise<void> {
    for (const key of this.namedRequirements) {
      const [source, value] = key.split(":").map(Number);
      await this.writeClientRequirement(source, value);
    }
    for (const key of this.explicitSubscriptions) {
      const [source, value] = key.split(":").map(Number);
      await this.writeClientRequirement(source, value);
    }
  }

  private async writeClientRequirement(
    source: number,
    value: number,
  ): Promise<void> {
    const data = new DataView(new ArrayBuffer(4));
    data.setUint16(0, source, true);
    data.setUint16(2, value, true);
    await BleClient.write(
      this.deviceId,
      profile.event.id,
      profile.event.characteristics.clientRequirements.id,
      data,
    );
  }

  private getSourceIds(): VersionSource | undefined {
    const version = this.getBoardVersion();
    if (!version) return undefined;
    return version === "V1" ? EventSource.v1 : EventSource.v2;
  }
}

function filterKey(source: number, value: number): string {
  return `${source}:${value}`;
}
