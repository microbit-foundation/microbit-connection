/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * @vitest-environment node
 *
 * Integration tests wiring the main-thread facade to the worker host
 * over a Node MessageChannel, with the USB device layer mocked.
 */
import { MessageChannel } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionStatus,
  ConnectionStatusChange,
  ProgressStage,
} from "../../device.js";
import { MicrobitUSBConnectionWorkerFacade } from "./facade.js";
import { startUSBWorkerHost } from "./host.js";
import { MessagePortLike } from "./rpc.js";

const mockState = vi.hoisted(() => ({
  boardVersion: "V2",
  serialOnData: undefined as ((data: string) => void) | undefined,
  stopPolling: vi.fn(),
  flashedData: [] as unknown[],
  jacdacPumps: [] as Array<{
    stopped: boolean;
    onFrame: (frame: Uint8Array) => void;
    sendFrame: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("../device-wrapper.js", () => ({
  USBDeviceWrapper: class USBDeviceWrapper {
    serial = {
      getBaudrate: vi.fn().mockResolvedValue(115200),
      setBaudrate: vi.fn().mockResolvedValue(undefined),
      startPolling: vi.fn((onData: (data: string) => void) => {
        mockState.serialOnData = onData;
        return new Promise(() => {});
      }),
      stopPolling: mockState.stopPolling,
      drain: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    };
    cortexM = {
      isHalted: vi.fn().mockResolvedValue(true),
      halt: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      softwareReset: vi.fn().mockResolvedValue(undefined),
    };
    adi = {
      reinit: vi.fn().mockResolvedValue(undefined),
    };
    reconnect = vi.fn().mockResolvedValue({
      boardSerialInfo: {
        id: {
          toBoardVersion: () => mockState.boardVersion,
          toString: () => "9900",
        },
        familyId: "99",
        hic: "00",
        eq: () => true,
      },
      deviceId: 1,
      pageSize: 1024,
      numPages: 256,
    });
    disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("../partial-flashing.js", () => ({
  PartialFlashing: class PartialFlashing {
    async flashAsync(
      data: unknown,
      progress: (stage: ProgressStage, value?: number) => void,
    ) {
      mockState.flashedData.push(data);
      progress(ProgressStage.PartialFlashing, 0.5);
      progress(ProgressStage.PartialFlashing, 1);
      return true;
    }
  },
}));

vi.mock("../jacdac-pump.js", () => ({
  JacdacPump: class MockJacdacPump {
    stopped = false;
    sendFrame = vi.fn().mockResolvedValue(undefined);
    private resolveStopped!: () => void;
    private stoppedPromise = new Promise<void>((resolve) => {
      this.resolveStopped = resolve;
    });
    constructor(
      _adi: unknown,
      public onFrame: (frame: Uint8Array) => void,
    ) {
      mockState.jacdacPumps.push(this);
    }
    startPumping() {
      return this.stoppedPromise;
    }
    stop() {
      this.stopped = true;
      this.resolveStopped();
    }
  },
}));

const fakeUsbDevice = {
  serialNumber: "SN123",
  vendorId: 0x0d28,
  productId: 0x0204,
  manufacturerName: "Arm",
  productName: "DAPLink",
};

let requestDeviceImpl: () => unknown;
let visibilityState = "visible";
let visibilityListeners: Array<() => void> = [];

const cleanups: Array<() => void> = [];

const setup = () => {
  const channel = new MessageChannel();
  startUSBWorkerHost(channel.port2 as unknown as MessagePortLike);
  const facade = new MicrobitUSBConnectionWorkerFacade(
    channel.port1 as unknown as Worker,
  );
  cleanups.push(() => {
    channel.port1.close();
    channel.port2.close();
  });
  return { facade, port: channel.port1 };
};

const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const waitForStatus = (
  facade: MicrobitUSBConnectionWorkerFacade,
  status: ConnectionStatus,
) =>
  new Promise<void>((resolve) => {
    if (facade.status === status) {
      resolve();
      return;
    }
    const listener = (event: ConnectionStatusChange) => {
      if (event.status === status) {
        facade.removeEventListener("status", listener);
        resolve();
      }
    };
    facade.addEventListener("status", listener);
  });

beforeEach(() => {
  mockState.boardVersion = "V2";
  mockState.serialOnData = undefined;
  mockState.stopPolling = vi.fn();
  mockState.flashedData = [];
  mockState.jacdacPumps = [];
  requestDeviceImpl = () => fakeUsbDevice;
  visibilityState = "visible";
  visibilityListeners = [];
  vi.stubGlobal("navigator", {
    usb: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestDevice: () => requestDeviceImpl(),
      getDevices: async () => [fakeUsbDevice],
    },
  });
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener: (_: string, listener: () => void) => {
      visibilityListeners.push(listener);
    },
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("window", {
    document,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  cleanups.forEach((f) => f());
  cleanups.length = 0;
  vi.unstubAllGlobals();
});

describe("Worker facade", () => {
  it("connects: picker events, status mirror and sync getters", async () => {
    const { facade } = setup();
    const before = vi.fn();
    const after = vi.fn();
    facade.addEventListener("beforerequestdevice", before);
    facade.addEventListener("afterrequestdevice", after);

    await facade.initialize();
    expect(facade.status).toBe(ConnectionStatus.NoAuthorizedDevice);
    await facade.connect();

    expect(facade.status).toBe(ConnectionStatus.Connected);
    expect(facade.getBoardVersion()).toBe("V2");
    expect(facade.getDeviceId()).toBe(1);
    expect(facade.getDevice()?.serialNumber).toBe("SN123");
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("maps picker cancellation to no-device-selected, still firing afterrequestdevice", async () => {
    const { facade } = setup();
    requestDeviceImpl = () => {
      throw new Error("No device selected.");
    };
    const after = vi.fn();
    facade.addEventListener("afterrequestdevice", after);
    await facade.initialize();
    await expect(facade.connect()).rejects.toMatchObject({
      code: "no-device-selected",
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("starts serial polling lazily and forwards data", async () => {
    const { facade } = setup();
    await facade.initialize();
    await facade.connect();
    expect(mockState.serialOnData).toBeUndefined();

    const received: string[] = [];
    const listener = (data: { data: string }) => received.push(data.data);
    facade.addEventListener("serialdata", listener);
    await waitFor(() => mockState.serialOnData !== undefined);

    mockState.serialOnData!("hello");
    await waitFor(() => received.length === 1);
    expect(received).toEqual(["hello"]);

    facade.removeEventListener("serialdata", listener);
    await waitFor(() => mockState.stopPolling.mock.calls.length === 1);
  });

  it("flashes: dataSource round trip, progress and flash event ordering", async () => {
    const { facade } = setup();
    await facade.initialize();
    await facade.connect();

    const order: string[] = [];
    facade.addEventListener("flash", () => order.push("flash-event"));
    const progress = vi.fn();
    const dataSource = vi.fn(async (boardVersion: string) => {
      expect(boardVersion).toBe("V2");
      return new Uint8Array([1, 2, 3]);
    });

    await facade.flash(dataSource, { progress });
    order.push("resolved");

    expect(dataSource).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["flash-event", "resolved"]);
    expect(mockState.flashedData.length).toBe(1);
    expect([...(mockState.flashedData[0] as Uint8Array)]).toEqual([1, 2, 3]);
    const stages = progress.mock.calls.map((c) => c[0]);
    expect(stages).toContain(ProgressStage.PartialFlashing);
  });

  it("pauses and resumes via visibility control messages", async () => {
    const { facade } = setup();
    await facade.initialize();
    await facade.connect();

    visibilityState = "hidden";
    visibilityListeners.forEach((l) => l());
    await waitForStatus(facade, ConnectionStatus.Paused);

    visibilityState = "visible";
    visibilityListeners.forEach((l) => l());
    await waitForStatus(facade, ConnectionStatus.Connected);
    // Info piggybacked on the worker-internal reconnect.
    expect(facade.getDeviceId()).toBe(1);
  });

  it("rejects a second init on the same worker", async () => {
    const { facade, port } = setup();
    await facade.initialize();
    const second = new MicrobitUSBConnectionWorkerFacade(
      port as unknown as Worker,
    );
    await expect(second.initialize()).rejects.toMatchObject({
      code: "connection-error",
    });
  });

  it("bridges Jacdac: lazy pump start, frame events and sends", async () => {
    const { facade } = setup();
    await facade.initialize();
    await facade.connect();

    const frames: Uint8Array[] = [];
    facade.addEventListener("jacdacframe", (data) => frames.push(data.frame));
    await waitFor(() => mockState.jacdacPumps.length === 1);

    // Worker-side pump delivers a frame; buffer is transferred across.
    mockState.jacdacPumps[0].onFrame(new Uint8Array([1, 2, 3, 4]));
    await waitFor(() => frames.length === 1);
    expect([...frames[0]]).toEqual([1, 2, 3, 4]);

    await facade.sendJacdacFrame(new Uint8Array(16));
    expect(mockState.jacdacPumps[0].sendFrame).toHaveBeenCalledTimes(1);
  });

  it("serialWrite and softwareReset proxy through", async () => {
    const { facade } = setup();
    await facade.initialize();
    await facade.connect();
    await facade.serialWrite("hi");
    await facade.softwareReset();
  });
});
