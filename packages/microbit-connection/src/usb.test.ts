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
import { ConnectionStatus, ConnectionStatusChange } from "./device.js";
import { applyDeviceFilters, createUSBConnection } from "./usb.js";
import { beforeAll, beforeEach, expect, vi, describe, it } from "vitest";

vi.mock("./usb-device-wrapper.js", () => ({
  USBDeviceWrapper: class USBDeviceWrapper {
    startSerial = vi.fn().mockReturnValue(Promise.resolve());
    reconnect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    stopSerial = vi.fn();
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
    expect(microbit.status).toBe(ConnectionStatus.NO_AUTHORIZED_DEVICE);
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
    expect(microbit.status).toBe(ConnectionStatus.NO_AUTHORIZED_DEVICE);
  });

  it("connects and disconnects updating status and events", async () => {
    const events: ConnectionStatus[] = [];
    const connection = createUSBConnection();
    connection.addEventListener("status", (event: ConnectionStatusChange) => {
      events.push(event.status);
    });

    await connection.connect();

    expect(connection.status).toEqual(ConnectionStatus.CONNECTED);
    expect(events).toEqual([ConnectionStatus.CONNECTED]);

    // without this it breaks! something is up!
    await new Promise((resolve) => setTimeout(resolve, 100));
    await connection.disconnect();
    connection.dispose();

    expect(connection.status).toEqual(ConnectionStatus.DISCONNECTED);
    expect(events).toEqual([
      ConnectionStatus.CONNECTED,
      ConnectionStatus.DISCONNECTED,
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
    expect(connection.status).toBe(ConnectionStatus.CONNECTED);

    visibilityState = "hidden";
    visibilityListeners.forEach((l) => l());

    await waitForStatus(connection, ConnectionStatus.PAUSED);
    expect(connection.status).toBe(ConnectionStatus.PAUSED);
  });

  it("reconnects when tab becomes visible while paused", async () => {
    const connection = createUSBConnection();
    await connection.initialize();
    await connection.connect();

    visibilityState = "hidden";
    visibilityListeners.forEach((l) => l());
    await waitForStatus(connection, ConnectionStatus.PAUSED);

    visibilityState = "visible";
    visibilityListeners.forEach((l) => l());

    await waitForStatus(connection, ConnectionStatus.CONNECTED);
    expect(connection.status).toBe(ConnectionStatus.CONNECTED);
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
