/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { ConnectionStatus, ConnectionStatusChange } from "../device.js";
import { createBluetoothConnection } from "./connection.js";
import { expect, vi, describe, it } from "vitest";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

// Mock BleClient
vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockResolvedValue(true),
    requestDevice: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getServices: vi.fn().mockResolvedValue([]),
  },
}));

// Mock flashing modules
vi.mock("./flashing/flashing-partial.js", () => ({
  default: vi.fn(),
  PartialFlashResult: { AttemptFullFlash: "AttemptFullFlash" },
}));

vi.mock("./flashing/flashing-full.js", () => ({
  fullFlash: vi.fn(),
}));

const setupNavigatorMock = () => {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      bluetooth: {
        getAvailability: vi.fn().mockResolvedValue(true),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        requestDevice: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });
};

describe("Bluetooth connection status events", () => {
  it("emits status events with correct previousStatus", async () => {
    setupNavigatorMock();
    const connection = createBluetoothConnection();
    await connection.initialize();

    expect(connection.status).toBe(ConnectionStatus.NO_AUTHORIZED_DEVICE);

    const events: ConnectionStatusChange[] = [];
    connection.addEventListener("status", (e) => {
      events.push(e);
    });

    await connection.disconnect();

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(ConnectionStatus.DISCONNECTED);
    expect(events[0].previousStatus).toBe(
      ConnectionStatus.NO_AUTHORIZED_DEVICE,
    );
  });

  it("defers status updates during flash, emitting single catch-up event", async () => {
    setupNavigatorMock();
    const connection = createBluetoothConnection();
    await connection.initialize();

    const statusBeforeFlash = connection.status;
    expect(statusBeforeFlash).toBe(ConnectionStatus.NO_AUTHORIZED_DEVICE);

    const events: ConnectionStatusChange[] = [];
    connection.addEventListener("status", (e) => {
      events.push(e);
    });

    // flash() will fail but the finally block still emits a catch-up event
    try {
      await connection.flash(async () => "mock-hex-data", {});
    } catch {
      // Expected to fail
    }

    // Should have exactly one catch-up event with correct previousStatus
    expect(events).toHaveLength(1);
    expect(events[0].previousStatus).toBe(statusBeforeFlash);
  });
});
