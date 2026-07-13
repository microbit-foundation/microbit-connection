/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * @jest-environment node
 *
 * Without node environment USB code fails with a buffer type check.
 * It might be we could create a custom environment that was web but
 * with a tweak to Buffer.
 */
import { ConnectionStatus, ConnectionStatusChange } from "../device.js";
import { applyDeviceFilters, createUSBConnection } from "./connection.js";
import { beforeAll, beforeEach, expect, vi, describe, it } from "vitest";

const mockState = vi.hoisted(() => ({
  boardVersion: "V2",
  jacdacPumps: [] as Array<{
    stopped: boolean;
    onFrame: (frame: Uint8Array) => void;
    sendFrame: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("./device-wrapper.js", () => ({
  USBDeviceWrapper: class USBDeviceWrapper {
    serial = {
      getBaudrate: vi.fn().mockResolvedValue(115200),
      setBaudrate: vi.fn().mockResolvedValue(undefined),
      startPolling: vi.fn().mockResolvedValue(undefined),
      stopPolling: vi.fn(),
      drain: vi.fn().mockResolvedValue(undefined),
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

vi.mock("./jacdac-pump.js", () => ({
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

const describeDeviceOnly = process.env.TEST_MODE_DEVICE
  ? describe
  : describe.skip;

describe("MicrobitUSBConnection (WebUSB unsupported)", () => {
  it("checkAvailability returns unsupported when WebUSB isn't available", async () => {
    vi.stubGlobal("navigator", {});
    const microbit = createUSBConnection();
    expect(await microbit.checkAvailability()).toBe("unsupported");
    vi.unstubAllGlobals();
  });
  it("still triggers afterrequestdevice if requestDevice throws", async () => {
    vi.stubGlobal("navigator", {
      usb: {
        requestDevice: () => {
          throw new Error();
        },
      },
    });
    const microbit = createUSBConnection();
    expect(microbit.status).toBe(ConnectionStatus.NoAuthorizedDevice);
    const afterRequestDevice = vi.fn();
    microbit.addEventListener("afterrequestdevice", afterRequestDevice);

    await expect(() => microbit.connect()).rejects.toThrow();

    expect(afterRequestDevice.mock.calls.length).toEqual(1);
    vi.unstubAllGlobals();
  });
});

describeDeviceOnly("MicrobitUSBConnection (WebUSB supported)", () => {
  beforeAll(() => {
    const usb = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestDevice() {
        const device = {};
        return device;
      },
    };
    // Maybe we can move this to a custom jest environment?
    vi.stubGlobal("navigator", {
      usb,
    });
  });

  it("shows no device as initial status", () => {
    const microbit = createUSBConnection();
    expect(microbit.status).toBe(ConnectionStatus.NoAuthorizedDevice);
  });

  it("connects and disconnects updating status and events", async () => {
    const events: ConnectionStatus[] = [];
    const connection = createUSBConnection();
    connection.addEventListener("status", (event: ConnectionStatusChange) => {
      events.push(event.status);
    });

    await connection.connect();

    expect(connection.status).toEqual(ConnectionStatus.Connected);
    expect(events).toEqual([ConnectionStatus.Connected]);

    // without this it breaks! something is up!
    await new Promise((resolve) => setTimeout(resolve, 100));
    await connection.disconnect();
    connection.dispose();

    expect(connection.status).toEqual(ConnectionStatus.Disconnected);
    expect(events).toEqual([
      ConnectionStatus.Connected,
      ConnectionStatus.Disconnected,
    ]);
  });
});

interface MockUSBDeviceConfig {
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  interfaceClass?: number;
  interfaceSubclass?: number;
  interfaceProtocol?: number;
  interfaceName?: string;
  interfaces?: MockUSBInterface[];
}
interface MockUSBInterface {
  interfaceNumber: number;
  alternates: MockUSBAlternateInterface[];
}
interface MockUSBAlternateInterface {
  interfaceClass: number;
  interfaceSubclass: number;
  interfaceProtocol: number;
  interfaceName?: string;
}

const mockDevice = (config?: MockUSBDeviceConfig) => ({
  vendorId: config?.vendorId || 0x2341,
  productId: config?.productId || 0x0043,
  serialNumber: config?.serialNumber || "MOCK123456",
  configuration: {
    interfaces: config?.interfaces || [
      {
        alternates: [
          {
            alternateSetting: 0,
            interfaceClass: config?.interfaceClass || 2,
            interfaceSubclass: config?.interfaceSubclass || 2,
            interfaceProtocol: config?.interfaceProtocol || 0,
          },
        ],
      },
    ],
  },
});

const filter: USBDeviceFilter = {
  classCode: 123,
  productId: 456,
  protocolCode: 789,
  serialNumber: "012",
  subclassCode: 345,
  vendorId: 690,
};

describe("Tab visibility and PAUSED state", () => {
  let visibilityState = "visible";
  let visibilityListeners: Array<() => void> = [];

  beforeAll(() => {
    vi.stubGlobal("navigator", {
      usb: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        requestDevice: () => ({}),
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

  beforeEach(() => {
    visibilityState = "visible";
    visibilityListeners = [];
  });

  const waitForStatus = (
    connection: ReturnType<typeof createUSBConnection>,
    status: ConnectionStatus,
  ) =>
    new Promise<void>((resolve) => {
      if (connection.status === status) {
        resolve();
        return;
      }
      const listener = (event: ConnectionStatusChange) => {
        if (event.status === status) {
          connection.removeEventListener("status", listener);
          resolve();
        }
      };
      connection.addEventListener("status", listener);
    });

  it("pauses when tab becomes hidden while connected", async () => {
    const connection = createUSBConnection();
    await connection.initialize();
    await connection.connect();
    expect(connection.status).toBe(ConnectionStatus.Connected);

    visibilityState = "hidden";
    visibilityListeners.forEach((l) => l());

    await waitForStatus(connection, ConnectionStatus.Paused);
    expect(connection.status).toBe(ConnectionStatus.Paused);
  });

  it("reconnects when tab becomes visible while paused", async () => {
    const connection = createUSBConnection();
    await connection.initialize();
    await connection.connect();

    visibilityState = "hidden";
    visibilityListeners.forEach((l) => l());
    await waitForStatus(connection, ConnectionStatus.Paused);

    visibilityState = "visible";
    visibilityListeners.forEach((l) => l());

    await waitForStatus(connection, ConnectionStatus.Connected);
    expect(connection.status).toBe(ConnectionStatus.Connected);
  });
});

describe("Jacdac pump lifecycle", () => {
  beforeAll(() => {
    vi.stubGlobal("navigator", {
      usb: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        requestDevice: () => ({}),
      },
    });
  });

  beforeEach(() => {
    mockState.boardVersion = "V2";
    mockState.jacdacPumps = [];
  });

  const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("waitFor timed out");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  it("starts the pump when a jacdacframe listener is added while connected", async () => {
    const connection = createUSBConnection();
    await connection.connect();
    expect(mockState.jacdacPumps.length).toBe(0);
    connection.addEventListener("jacdacframe", () => {});
    await waitFor(() => mockState.jacdacPumps.length === 1);
  });

  it("starts the pump on connect when a listener was already added", async () => {
    const connection = createUSBConnection();
    connection.addEventListener("jacdacframe", () => {});
    expect(mockState.jacdacPumps.length).toBe(0);
    await connection.connect();
    await waitFor(() => mockState.jacdacPumps.length === 1);
  });

  it("does not start the pump on V1", async () => {
    mockState.boardVersion = "V1";
    const connection = createUSBConnection();
    connection.addEventListener("jacdacframe", () => {});
    await connection.connect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockState.jacdacPumps.length).toBe(0);
    await expect(
      connection.sendJacdacFrame(new Uint8Array(12)),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("stops the pump when the last listener is removed", async () => {
    const connection = createUSBConnection();
    await connection.connect();
    const listener = () => {};
    connection.addEventListener("jacdacframe", listener);
    await waitFor(() => mockState.jacdacPumps.length === 1);
    connection.removeEventListener("jacdacframe", listener);
    await waitFor(() => mockState.jacdacPumps[0].stopped);
  });

  it("stops the pump on disconnect", async () => {
    const connection = createUSBConnection();
    await connection.connect();
    connection.addEventListener("jacdacframe", () => {});
    await waitFor(() => mockState.jacdacPumps.length === 1);
    await connection.disconnect();
    expect(mockState.jacdacPumps[0].stopped).toBe(true);
  });

  it("forwards pump frames as jacdacframe events", async () => {
    const connection = createUSBConnection();
    await connection.connect();
    const frames: Uint8Array[] = [];
    connection.addEventListener("jacdacframe", (data) =>
      frames.push(data.frame),
    );
    await waitFor(() => mockState.jacdacPumps.length === 1);
    const frame = new Uint8Array([1, 2, 3]);
    mockState.jacdacPumps[0].onFrame(frame);
    expect(frames).toEqual([frame]);
  });

  it("sendJacdacFrame starts the pump and delegates to it", async () => {
    const connection = createUSBConnection();
    await connection.connect();
    const frame = new Uint8Array(16);
    await connection.sendJacdacFrame(frame);
    expect(mockState.jacdacPumps.length).toBe(1);
    expect(mockState.jacdacPumps[0].sendFrame).toHaveBeenCalledWith(frame);
  });

  it("sendJacdacFrame rejects when not connected", async () => {
    const connection = createUSBConnection();
    await expect(
      connection.sendJacdacFrame(new Uint8Array(12)),
    ).rejects.toMatchObject({ code: "not-connected" });
  });
});

describe("applyDevicesFilter", () => {
  it("has no filter", () => {
    const device = mockDevice() as USBDevice;
    expect(applyDeviceFilters(device, [], [])).toEqual(true);
  });
  it("satisfies filter", () => {
    const device = mockDevice({
      interfaceClass: filter.classCode,
      productId: filter.productId,
      interfaceProtocol: filter.protocolCode,
      serialNumber: filter.serialNumber,
      interfaceSubclass: filter.subclassCode,
      vendorId: filter.vendorId,
    }) as USBDevice;
    expect(applyDeviceFilters(device, [filter], [])).toEqual(true);
  });
  it("does not satisfies filter", () => {
    const device = mockDevice({
      interfaceClass: filter.classCode,
      productId: filter.productId,
      interfaceProtocol: filter.protocolCode,
      serialNumber: "something else",
      interfaceSubclass: filter.subclassCode,
      vendorId: filter.vendorId,
    }) as USBDevice;
    expect(applyDeviceFilters(device, [filter], [])).toEqual(false);
  });
  it("satisfies exclusion filter", () => {
    const device = mockDevice({
      interfaceClass: filter.classCode,
      productId: filter.productId,
      interfaceProtocol: filter.protocolCode,
      serialNumber: filter.serialNumber,
      interfaceSubclass: filter.subclassCode,
      vendorId: filter.vendorId,
    }) as USBDevice;
    expect(applyDeviceFilters(device, [], [filter])).toEqual(false);
  });
  it("satifies filter and does not satisfy exclusion filter", () => {
    const device = mockDevice({
      interfaceClass: filter.classCode,
      productId: filter.productId,
      interfaceProtocol: filter.protocolCode,
      serialNumber: filter.serialNumber,
      interfaceSubclass: filter.subclassCode,
      vendorId: filter.vendorId,
    }) as USBDevice;
    expect(
      applyDeviceFilters(
        device,
        [filter],
        [{ ...filter, serialNumber: "not satisfied" }],
      ),
    ).toEqual(true);
  });
});
