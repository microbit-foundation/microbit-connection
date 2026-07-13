/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceError } from "../device.js";
import { type Logging } from "../logging.js";
import { type ArmDebug } from "./arm-debug.js";
import {
  type CmsisDap,
  type DapOperation,
  DapTransferError,
} from "./cmsis-dap.js";
import { JacdacPump } from "./jacdac-pump.js";

const nullLogging: Logging = {
  event: () => {},
  error: () => {},
  log: () => {},
};

const MAGIC_0 = 0x786d444a;
const MAGIC_1 = 0xb0a6c0e9;
const SCAN_ORIGIN = 0x2000_6000;
const NVIC_ISPR_BASE = 0xe000e200;

interface WriteLogEntry {
  address: number;
  values: number[];
}

/**
 * Word-addressed memory-backed ArmDebug. Reads default to 0. All writes
 * are applied to memory and recorded in order.
 */
class MockArmDebug implements ArmDebug {
  readonly dap = {} as CmsisDap;
  isOpen = true;
  memory = new Map<number, number>();
  writes: WriteLogEntry[] = [];
  reinitCount = 0;
  /** Each read/write throws DapTransferError while this is positive. */
  failNextOps = 0;

  private checkFail() {
    if (this.failNextOps > 0) {
      this.failNextOps--;
      throw new DapTransferError(2, 0, 1);
    }
  }

  word(address: number): number {
    return this.memory.get(address) ?? 0;
  }

  setWord(address: number, value: number): void {
    this.memory.set(address, value >>> 0);
  }

  setBytes(address: number, bytes: number[]): void {
    for (let i = 0; i < bytes.length; i += 4) {
      const word =
        (bytes[i] ?? 0) |
        ((bytes[i + 1] ?? 0) << 8) |
        ((bytes[i + 2] ?? 0) << 16) |
        ((bytes[i + 3] ?? 0) << 24);
      this.setWord(address + i, word);
    }
  }

  async readMem32(address: number): Promise<number> {
    this.checkFail();
    return this.word(address);
  }

  async writeMem32(address: number, value: number): Promise<void> {
    this.checkFail();
    this.setWord(address, value);
    this.writes.push({ address, values: [value >>> 0] });
  }

  async readBlock(address: number, count: number): Promise<Uint32Array> {
    this.checkFail();
    const result = new Uint32Array(count);
    for (let i = 0; i < count; ++i) {
      result[i] = this.word(address + i * 4);
    }
    return result;
  }

  async writeBlock(address: number, values: Uint32Array): Promise<void> {
    this.checkFail();
    values.forEach((value, i) => this.setWord(address + i * 4, value));
    this.writes.push({ address, values: [...values] });
  }

  readMem32Ops(): DapOperation[] {
    throw new Error("Unused by JacdacPump");
  }
  writeMem32Ops(): DapOperation[] {
    throw new Error("Unused by JacdacPump");
  }
  async transferSequence(): Promise<Uint32Array> {
    throw new Error("Unused by JacdacPump");
  }
  resetState(): void {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async reinit(): Promise<void> {
    this.reinitCount++;
  }
}

/**
 * Seed a freshly-initialized exchange struct as CODAL would create it:
 * magic words, irqn, RX slot size byte 0xff.
 */
const seedExchange = (adi: MockArmDebug, address: number, irqn = 3) => {
  adi.setWord(address, MAGIC_0);
  adi.setWord(address + 4, MAGIC_1);
  adi.setWord(address + 8, irqn & 0xff);
  adi.setWord(address + 12, 0xff << 16);
};

/** A valid Jacdac frame: 12-byte header (size at byte 2) + data. */
const makeFrame = (dataSize: number): number[] => {
  const bytes = new Array<number>(12 + dataSize).fill(0);
  bytes[0] = 0xaa;
  bytes[1] = 0xbb;
  bytes[2] = dataSize;
  for (let i = 12; i < bytes.length; ++i) {
    bytes[i] = i & 0xff;
  }
  return bytes;
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

const unlockWriteIndex = (adi: MockArmDebug, xchg: number) =>
  adi.writes.findIndex(
    (w) =>
      w.address === xchg + 12 && w.values.length === 1 && w.values[0] === 0,
  );

interface Harness {
  adi: MockArmDebug;
  pump: JacdacPump;
  frames: Uint8Array[];
  pumping: Promise<void>;
  stop: () => Promise<void>;
}

const startPump = (adi: MockArmDebug): Harness => {
  const frames: Uint8Array[] = [];
  const pump = new JacdacPump(adi, (frame) => frames.push(frame), nullLogging);
  const pumping = pump.startPumping();
  // Avoid unhandled rejections when tests don't await pumping directly.
  pumping.catch(() => {});
  return {
    adi,
    pump,
    frames,
    pumping,
    stop: async () => {
      pump.stop();
      await pumping.catch(() => {});
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("JacdacPump exchange discovery", () => {
  it("finds the exchange at the scan origin and unlocks it", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);
    await h.stop();
    await expect(h.pumping).resolves.toBeUndefined();
  });

  it("finds the exchange below the scan origin", async () => {
    const adi = new MockArmDebug();
    const xchg = 0x2000_3000;
    seedExchange(adi, xchg);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, xchg) !== -1);
    await h.stop();
  });

  it("finds the exchange above the scan origin", async () => {
    const adi = new MockArmDebug();
    const xchg = 0x2000_9000;
    seedExchange(adi, xchg);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, xchg) !== -1);
    await h.stop();
  });

  it("finds the exchange at a non-chunk-aligned address", async () => {
    const adi = new MockArmDebug();
    const xchg = 0x2000_6000 + 0x123 * 4;
    seedExchange(adi, xchg);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, xchg) !== -1);
    await h.stop();
  });

  it("finds magic words straddling a scan chunk boundary", async () => {
    const adi = new MockArmDebug();
    // MAGIC_0 in the last word of one 1024-byte chunk, MAGIC_1 in the
    // first word of the next (missed by the CMSISProto scan we ported).
    const xchg = SCAN_ORIGIN + 1024 - 4;
    seedExchange(adi, xchg);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, xchg) !== -1);
    await h.stop();
  });

  it("rejects with jacdac-missing when there is no exchange", async () => {
    vi.useFakeTimers();
    const adi = new MockArmDebug();
    const h = startPump(adi);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(h.pumping).rejects.toMatchObject({ code: "jacdac-missing" });
  });

  it("treats transfer errors while scanning as end of readable RAM", async () => {
    vi.useFakeTimers();
    const adi = new MockArmDebug();
    // Every read fails: both probes give up immediately rather than
    // failing the pump, then retry until the deadline.
    adi.failNextOps = Number.MAX_SAFE_INTEGER;
    const h = startPump(adi);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(h.pumping).rejects.toMatchObject({ code: "jacdac-missing" });
  });

  it("proceeds without unlocking when the slot holds a stale frame", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    // A stale frame from a previous host session rather than 0xff.
    adi.setBytes(SCAN_ORIGIN + 12, makeFrame(4));
    const h = startPump(adi);
    await waitFor(() => h.frames.length === 1);
    expect(h.frames[0].length).toBe(16);
    await h.stop();
  });

  it("rejects when the slot size byte is implausible", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    adi.setWord(SCAN_ORIGIN + 12, 0xfe << 16);
    const h = startPump(adi);
    await expect(h.pumping).rejects.toMatchObject({
      code: "connection-error",
    });
  });
});

describe("JacdacPump receive", () => {
  it("delivers frames, releasing the slot and raising the IRQ first", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN, 3);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);
    adi.writes = [];

    const frame = makeFrame(5);
    adi.setBytes(SCAN_ORIGIN + 12, frame);
    await waitFor(() => h.frames.length === 1);

    expect([...h.frames[0]]).toEqual(frame);
    const release = adi.writes.findIndex(
      (w) => w.address === SCAN_ORIGIN + 12 && w.values[0] === 0,
    );
    const irq = adi.writes.findIndex(
      (w) => w.address === NVIC_ISPR_BASE && w.values[0] === 1 << 3,
    );
    expect(release).toBeGreaterThanOrEqual(0);
    expect(irq).toBeGreaterThan(release);
    await h.stop();
  });

  it("signals via the second ISPR register for irqn >= 32", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN, 33);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    adi.setBytes(SCAN_ORIGIN + 12, makeFrame(4));
    await waitFor(() => h.frames.length === 1);
    expect(
      adi.writes.some(
        (w) => w.address === NVIC_ISPR_BASE + 4 && w.values[0] === 1 << 1,
      ),
    ).toBe(true);
    await h.stop();
  });

  it("re-attaches when the target re-initializes the exchange", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    // Target reset re-creates the struct with the fresh 0xff marker.
    adi.setWord(SCAN_ORIGIN + 12, 0xff << 16);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    adi.setBytes(SCAN_ORIGIN + 12, makeFrame(2));
    await waitFor(() => h.frames.length === 1);
    await h.stop();
  });
});

describe("JacdacPump send", () => {
  it("validates frame length synchronously", async () => {
    const adi = new MockArmDebug();
    const pump = new JacdacPump(adi, () => {}, nullLogging);
    expect(() => pump.sendFrame(new Uint8Array(11))).toThrow(RangeError);
    expect(() => pump.sendFrame(new Uint8Array(253))).toThrow(RangeError);
  });

  it("writes the body before the header and resolves on consumption", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN, 7);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);
    adi.writes = [];

    const frame = Uint8Array.from(makeFrame(1)); // 13 bytes, padded to 16
    let resolved = false;
    const sent = h.pump.sendFrame(frame).then(() => {
      resolved = true;
    });

    const bodyIndex = () =>
      adi.writes.findIndex((w) => w.address === SCAN_ORIGIN + 12 + 256 + 4);
    const headerIndex = () =>
      adi.writes.findIndex((w) => w.address === SCAN_ORIGIN + 12 + 256);
    await waitFor(() => headerIndex() !== -1);

    expect(bodyIndex()).toBeGreaterThanOrEqual(0);
    expect(bodyIndex()).toBeLessThan(headerIndex());
    const irq = adi.writes.findIndex(
      (w) => w.address === NVIC_ISPR_BASE && w.values[0] === 1 << 7,
    );
    expect(irq).toBeGreaterThan(headerIndex());
    // Body is the padded frame minus the 4-byte header.
    expect(adi.writes[bodyIndex()].values.length).toBe(3);
    expect(adi.writes[headerIndex()].values[0]).toBe(
      (0xaa | (0xbb << 8) | (1 << 16)) >>> 0,
    );

    // Not resolved until the device zeroes the header's size byte.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(resolved).toBe(false);
    adi.setWord(SCAN_ORIGIN + 12 + 256, 0);
    await sent;
    await h.stop();
  });

  it("serializes queued sends", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);
    adi.writes = [];

    const first = h.pump.sendFrame(Uint8Array.from(makeFrame(4)));
    const second = h.pump.sendFrame(Uint8Array.from(makeFrame(8)));
    const headerWrites = () =>
      adi.writes.filter((w) => w.address === SCAN_ORIGIN + 12 + 256).length;

    await waitFor(() => headerWrites() === 1);
    // Second send waits while the first is unconsumed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(headerWrites()).toBe(1);

    adi.setWord(SCAN_ORIGIN + 12 + 256, 0);
    await first;
    await waitFor(() => headerWrites() === 2);
    adi.setWord(SCAN_ORIGIN + 12 + 256, 0);
    await second;
    await h.stop();
  });

  it("rejects pending sends on stop", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    const pending = h.pump.sendFrame(Uint8Array.from(makeFrame(4)));
    await h.stop();
    await expect(pending).rejects.toMatchObject({ code: "not-connected" });
    // Sends after stop reject immediately.
    await expect(
      h.pump.sendFrame(Uint8Array.from(makeFrame(4))),
    ).rejects.toMatchObject({ code: "not-connected" });
  });

  it("rejects pending sends with the terminal error on failure", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    adi.setWord(SCAN_ORIGIN + 12, 0xfe << 16);
    const pump = new JacdacPump(adi, () => {}, nullLogging);
    const pumping = pump.startPumping();
    pumping.catch(() => {});
    // Queued before the failure surfaces.
    const pending = pump.sendFrame(Uint8Array.from(makeFrame(4)));
    await expect(pending).rejects.toMatchObject({ code: "connection-error" });
    await expect(pumping).rejects.toMatchObject({ code: "connection-error" });
  });
});

describe("JacdacPump recovery", () => {
  it("recovers from a transient transfer error", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    adi.failNextOps = 1;
    await waitFor(() => adi.reinitCount === 1);
    adi.setBytes(SCAN_ORIGIN + 12, makeFrame(3));
    await waitFor(() => h.frames.length === 1);
    await h.stop();
  });

  it("rescans when the exchange has moved", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    // Reset moved the heap allocation.
    const newXchg = SCAN_ORIGIN + 0x800;
    adi.setWord(SCAN_ORIGIN, 0);
    adi.setWord(SCAN_ORIGIN + 4, 0);
    seedExchange(adi, newXchg);
    adi.failNextOps = 1;

    await waitFor(() => unlockWriteIndex(adi, newXchg) !== -1, 5000);
    adi.setBytes(newXchg + 12, makeFrame(3));
    await waitFor(() => h.frames.length === 1);
    await h.stop();
  });

  it("fails when recovery also fails", async () => {
    const adi = new MockArmDebug();
    seedExchange(adi, SCAN_ORIGIN);
    const h = startPump(adi);
    await waitFor(() => unlockWriteIndex(adi, SCAN_ORIGIN) !== -1);

    // First failure triggers recovery; the second fails the magic
    // re-check inside recovery itself.
    adi.failNextOps = 2;
    await expect(h.pumping).rejects.toBeInstanceOf(DapTransferError);
  });
});
