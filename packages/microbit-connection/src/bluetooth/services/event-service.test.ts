import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { EventService } from "./event-service.js";
import { V2Source, GestureEvent, ButtonAction } from "../../microbit-events.js";
import type { TypedServiceEventDispatcher } from "../../service-events.js";

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    writeWithoutResponse: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../ble-error.js", () => ({
  mapBleError: (e: unknown) => e,
}));

function makeEvent(source: number, value: number): DataView {
  const data = new DataView(new ArrayBuffer(4));
  data.setUint16(0, source, true);
  data.setUint16(2, value, true);
  return data;
}

function makeMultiEvent(...pairs: [number, number][]): DataView {
  const data = new DataView(new ArrayBuffer(pairs.length * 4));
  pairs.forEach(([source, value], i) => {
    data.setUint16(i * 4, source, true);
    data.setUint16(i * 4 + 2, value, true);
  });
  return data;
}

/** Captures the notification callback passed to BleClient.startNotifications */
function captureNotificationCallback(): (data: DataView) => void {
  const calls = (BleClient.startNotifications as Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall[3];
}

describe("EventService", () => {
  let service: EventService;
  let dispatch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn();
    service = new EventService(
      "test-device",
      dispatch as TypedServiceEventDispatcher,
      () => "V2",
    );
  });

  describe("named events", () => {
    it("dispatches gesturechanged when listening", async () => {
      await service.startNotifications("gesturechanged");
      const notify = captureNotificationCallback();

      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));

      expect(dispatch).toHaveBeenCalledWith("gesturechanged", {
        gesture: GestureEvent.Shake,
      });
    });

    it("dispatches button actions for A, B, AB", async () => {
      await service.startNotifications("buttonaaction");
      await service.startNotifications("buttonbaction");
      await service.startNotifications("buttonabaction");
      const notify = captureNotificationCallback();

      notify(makeEvent(V2Source.ButtonA, ButtonAction.Click));
      notify(makeEvent(V2Source.ButtonB, ButtonAction.LongClick));
      notify(makeEvent(V2Source.ButtonAB, ButtonAction.DoubleClick));

      expect(dispatch).toHaveBeenCalledWith("buttonaaction", {
        button: "A",
        action: ButtonAction.Click,
      });
      expect(dispatch).toHaveBeenCalledWith("buttonbaction", {
        button: "B",
        action: ButtonAction.LongClick,
      });
      expect(dispatch).toHaveBeenCalledWith("buttonabaction", {
        button: "AB",
        action: ButtonAction.DoubleClick,
      });
    });

    it("dispatches logoaction (V2 only)", async () => {
      await service.startNotifications("logoaction");
      const notify = captureNotificationCallback();

      notify(makeEvent(V2Source.Logo, ButtonAction.Click));

      expect(dispatch).toHaveBeenCalledWith("logoaction", {
        button: "Logo",
        action: ButtonAction.Click,
      });
    });

    it("does not dispatch after stopping a named event", async () => {
      await service.startNotifications("gesturechanged");
      const notify = captureNotificationCallback();
      await service.stopNotifications("gesturechanged");

      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));

      expect(dispatch).not.toHaveBeenCalledWith(
        "gesturechanged",
        expect.anything(),
      );
    });

    it("handles multiple events packed in one notification", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("buttonaaction");
      const notify = captureNotificationCallback();

      notify(
        makeMultiEvent(
          [V2Source.Gesture, GestureEvent.FaceUp],
          [V2Source.ButtonA, ButtonAction.Click],
        ),
      );

      expect(dispatch).toHaveBeenCalledWith("gesturechanged", {
        gesture: GestureEvent.FaceUp,
      });
      expect(dispatch).toHaveBeenCalledWith("buttonaaction", {
        button: "A",
        action: ButtonAction.Click,
      });
    });
  });

  describe("microbitevent isolation", () => {
    it("does not dispatch microbitevent for named event traffic", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("microbitevent");
      const notify = captureNotificationCallback();

      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));

      expect(dispatch).toHaveBeenCalledWith("gesturechanged", {
        gesture: GestureEvent.Shake,
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        "microbitevent",
        expect.anything(),
      );
    });

    it("dispatches microbitevent only for explicit subscriptions", async () => {
      await service.startNotifications("microbitevent");
      await service.subscribeToEvent(999, 0);
      const notify = captureNotificationCallback();

      notify(makeEvent(999, 42));

      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: 999,
        value: 42,
      });
    });

    it("wildcard subscription (value=0) matches all values from that source", async () => {
      await service.startNotifications("microbitevent");
      await service.subscribeToEvent(999, 0);
      const notify = captureNotificationCallback();

      notify(makeEvent(999, 1));
      notify(makeEvent(999, 2));
      notify(makeEvent(888, 1));

      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: 999,
        value: 1,
      });
      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: 999,
        value: 2,
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        "microbitevent",
        expect.objectContaining({ source: 888 }),
      );
    });

    it("exact subscription only matches that specific value", async () => {
      await service.startNotifications("microbitevent");
      await service.subscribeToEvent(999, 5);
      const notify = captureNotificationCallback();

      notify(makeEvent(999, 5));
      notify(makeEvent(999, 6));

      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: 999,
        value: 5,
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        "microbitevent",
        expect.objectContaining({ value: 6 }),
      );
    });

    it("named events and explicit subscriptions work independently", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("microbitevent");
      await service.subscribeToEvent(999, 0);
      const notify = captureNotificationCallback();

      // Gesture events go to gesturechanged only
      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));
      // Custom events go to microbitevent only
      notify(makeEvent(999, 42));

      expect(dispatch).toHaveBeenCalledWith("gesturechanged", {
        gesture: GestureEvent.Shake,
      });
      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: 999,
        value: 42,
      });
      // Gesture should NOT leak into microbitevent
      expect(dispatch).not.toHaveBeenCalledWith(
        "microbitevent",
        expect.objectContaining({ source: V2Source.Gesture }),
      );
    });

    it("overlapping named + explicit subscription dispatches both", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("microbitevent");
      // Explicitly subscribe to the same source as the named event
      await service.subscribeToEvent(V2Source.Gesture, 0);
      const notify = captureNotificationCallback();

      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));

      // Both fire — you asked for both
      expect(dispatch).toHaveBeenCalledWith("gesturechanged", {
        gesture: GestureEvent.Shake,
      });
      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: V2Source.Gesture,
        value: GestureEvent.Shake,
      });
    });

    it("stopping named event leaves explicit subscription working", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("microbitevent");
      await service.subscribeToEvent(V2Source.Gesture, 0);
      const notify = captureNotificationCallback();

      await service.stopNotifications("gesturechanged");
      dispatch.mockClear();

      notify(makeEvent(V2Source.Gesture, GestureEvent.Shake));

      // Named event stopped
      expect(dispatch).not.toHaveBeenCalledWith(
        "gesturechanged",
        expect.anything(),
      );
      // Explicit subscription still works
      expect(dispatch).toHaveBeenCalledWith("microbitevent", {
        source: V2Source.Gesture,
        value: GestureEvent.Shake,
      });
    });
  });

  describe("BLE notification lifecycle", () => {
    it("re-registers BLE notifications on each startNotifications call to handle reconnect", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("buttonaaction");
      await service.startNotifications("microbitevent");

      expect(BleClient.startNotifications).toHaveBeenCalledTimes(3);
    });

    it("stops BLE notifications only when all event types are stopped", async () => {
      await service.startNotifications("gesturechanged");
      await service.startNotifications("buttonaaction");

      await service.stopNotifications("gesturechanged");
      expect(BleClient.stopNotifications).not.toHaveBeenCalled();

      await service.stopNotifications("buttonaaction");
      expect(BleClient.stopNotifications).toHaveBeenCalledTimes(1);
    });

    it("ignores irrelevant event types", async () => {
      await service.startNotifications("accelerometerdatachanged");
      expect(BleClient.startNotifications).not.toHaveBeenCalled();
    });
  });

  describe("client requirements", () => {
    it("writes client requirements for named events", async () => {
      await service.startNotifications("gesturechanged");

      expect(BleClient.write).toHaveBeenCalled();
      const calls = (BleClient.write as Mock).mock.calls;
      const data = calls[calls.length - 1][3] as DataView;
      expect(data.getUint16(0, true)).toBe(V2Source.Gesture);
      expect(data.getUint16(2, true)).toBe(0);
    });

    it("writes client requirements for explicit subscriptions", async () => {
      await service.subscribeToEvent(999, 42);

      expect(BleClient.write).toHaveBeenCalled();
      const calls = (BleClient.write as Mock).mock.calls;
      const data = calls[calls.length - 1][3] as DataView;
      expect(data.getUint16(0, true)).toBe(999);
      expect(data.getUint16(2, true)).toBe(42);
    });

    it("does not duplicate explicit subscription writes", async () => {
      await service.subscribeToEvent(999, 42);
      await service.subscribeToEvent(999, 42);

      expect(BleClient.write).toHaveBeenCalledTimes(1);
    });
  });
});
