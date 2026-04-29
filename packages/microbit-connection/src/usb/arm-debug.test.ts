import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceError } from "../device.js";
import { ConsoleLogging } from "../logging.js";
import { ArmDebugSwd, waitFor } from "./arm-debug.js";
import {
  AP,
  type CmsisDap,
  type DapOperation,
  DapResponseMismatchError,
  DP,
  READ,
  WRITE,
} from "./cmsis-dap.js";

// ---------------------------------------------------------------------------
// Mock DAP
// ---------------------------------------------------------------------------

/**
 * Creates a mock Dap that records transfer calls and returns configurable
 * values. By default all methods resolve successfully.
 *
 * Read operations auto-respond from a register map (keyed by "port:register")
 * when no queued results are available, making tests resilient to changes in
 * the number or ordering of internal transfer calls.
 */
function createMockDap() {
  // Track all transfer calls for assertions
  const transferCalls: DapOperation[][] = [];

  // Queue of return values for transfer() — takes priority over registers.
  const transferResults: Uint32Array[] = [];

  // Queue of return values for transferBlockRead()
  const blockReadResults: Uint32Array[] = [];

  // Register map for auto-responding to reads when the queue is empty.
  const registers = new Map<string, number>();

  let _isOpen = false;

  const mock: CmsisDap & {
    transferCalls: DapOperation[][];
    registers: Map<string, number>;
    queueTransferResult(...values: number[]): void;
    queueBlockReadResult(...values: number[]): void;
  } = {
    get isOpen() {
      return _isOpen;
    },
    blockSize: 59, // same as real CmsisDapUsb (64 - 4 - 1)

    transferCalls,
    registers,
    queueTransferResult(...values: number[]) {
      transferResults.push(new Uint32Array(values));
    },
    queueBlockReadResult(...values: number[]) {
      blockReadResults.push(new Uint32Array(values));
    },

    open: vi.fn(async () => {
      _isOpen = true;
    }),
    close: vi.fn(async () => {
      _isOpen = false;
    }),
    send: vi.fn(async () => new DataView(new ArrayBuffer(64))),
    clearAbort: vi.fn(async () => {}),
    swjSequence: vi.fn(async () => {}),
    swjClock: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    configureTransfer: vi.fn(async () => {}),
    drainStaleResponses: vi.fn(async () => {}),

    transfer: vi.fn(async (ops: DapOperation[]) => {
      transferCalls.push([...ops]);
      if (transferResults.length > 0) {
        return transferResults.shift()!;
      }
      // Auto-respond: return values for READ ops from the register map.
      const readValues: number[] = [];
      for (const op of ops) {
        if (op.mode === READ) {
          readValues.push(registers.get(`${op.port}:${op.register}`) ?? 0);
        }
      }
      return new Uint32Array(readValues);
    }),
    transferBlockRead: vi.fn(async () => {
      return blockReadResults.shift() ?? new Uint32Array(0);
    }),
    transferBlockWrite: vi.fn(async () => {}),
  };

  return mock;
}

// CTRL/STAT power-up ACK bits (must match arm-debug.ts constants)
const CSYSPWRUPACK = 1 << 31;
const CDBGPWRUPACK = 1 << 29;
const POWER_UP_ACK = (CSYSPWRUPACK | CDBGPWRUPACK) >>> 0;

// AP registers
const AP_DRW = 0x0c;

const logging = new ConsoleLogging();

// DP registers (matching arm-debug.ts constants)
const DP_DPIDR = 0x0;
const DP_CTRL_STAT = 0x4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up register map values so the SWD connect sequence succeeds.
 * Unlike a queue-based approach, this is resilient to changes in the
 * number or ordering of internal transfer calls during connect.
 */
function setupConnectRegisters(dap: ReturnType<typeof createMockDap>) {
  dap.registers.set(`${DP}:${DP_DPIDR}`, 0x0bb11477);
  dap.registers.set(`${DP}:${DP_CTRL_STAT}`, POWER_UP_ACK);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ArmDebugSwd", () => {
  let dap: ReturnType<typeof createMockDap>;
  let adi: ArmDebugSwd;

  beforeEach(() => {
    dap = createMockDap();
    adi = new ArmDebugSwd(dap, logging);
  });

  describe("connect", () => {
    it("runs the SWD init sequence", async () => {
      setupConnectRegisters(dap);

      await adi.connect();

      // Transport opened
      expect(dap.open).toHaveBeenCalled();
      // SWD protocol setup
      expect(dap.swjClock).toHaveBeenCalledWith(10_000_000);
      expect(dap.connect).toHaveBeenCalled();
      expect(dap.configureTransfer).toHaveBeenCalledWith(0, 100, 0);
      // 4 SWJ sequences (line reset, SWD select, line reset, idle)
      expect(dap.swjSequence).toHaveBeenCalledTimes(4);
      // DP register operations happened
      expect(dap.transfer).toHaveBeenCalled();
    });

    it("skips if already connected", async () => {
      setupConnectRegisters(dap);
      await adi.connect();

      vi.mocked(dap.open).mockClear();
      await adi.connect();
      expect(dap.open).not.toHaveBeenCalled();
    });

    it("retries on DapResponseMismatchError", async () => {
      // First attempt: swjClock throws mismatch
      vi.mocked(dap.swjClock).mockRejectedValueOnce(
        new DapResponseMismatchError(0x11, 0x05),
      );
      // clearAbort on the failed attempt
      vi.mocked(dap.clearAbort).mockResolvedValueOnce(undefined);

      // Second attempt succeeds
      setupConnectRegisters(dap);

      await adi.connect();

      expect(dap.drainStaleResponses).toHaveBeenCalledTimes(1);
      expect(dap.swjClock).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries", async () => {
      vi.mocked(dap.swjClock).mockRejectedValue(
        new DapResponseMismatchError(0x11, 0x05),
      );

      await expect(adi.connect(2)).rejects.toThrow(DapResponseMismatchError);
      expect(dap.drainStaleResponses).toHaveBeenCalledTimes(1);
    });

    it("rethrows non-mismatch errors immediately", async () => {
      vi.mocked(dap.swjClock).mockRejectedValueOnce(new Error("USB gone"));

      await expect(adi.connect()).rejects.toThrow("USB gone");
      expect(dap.drainStaleResponses).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("disconnects and closes transport", async () => {
      setupConnectRegisters(dap);
      await adi.connect();

      await adi.disconnect();

      expect(dap.disconnect).toHaveBeenCalled();
      expect(dap.close).toHaveBeenCalled();
    });

    it("is a no-op if not connected", async () => {
      await adi.disconnect();
      expect(dap.disconnect).not.toHaveBeenCalled();
      expect(dap.close).not.toHaveBeenCalled();
    });

    it("falls back to clearAbort if disconnect fails", async () => {
      setupConnectRegisters(dap);
      await adi.connect();

      vi.mocked(dap.disconnect).mockRejectedValueOnce(new Error("fail"));

      await adi.disconnect();

      expect(dap.clearAbort).toHaveBeenCalled();
      expect(dap.close).toHaveBeenCalled();
    });
  });

  describe("reinit", () => {
    it("resets state and reconnects without closing", async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      vi.mocked(dap.open).mockClear();
      vi.mocked(dap.close).mockClear();

      // reinit calls connectOnce which needs the full sequence
      setupConnectRegisters(dap);
      await adi.reinit();

      // open is called again (connectOnce opens transport)
      expect(dap.open).toHaveBeenCalled();
      // close was NOT called (reinit doesn't close)
      expect(dap.close).not.toHaveBeenCalled();
    });
  });

  describe("readMem32 / writeMem32", () => {
    beforeEach(async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      dap.transferCalls.length = 0;
    });

    it("reads a 32-bit value from memory", async () => {
      dap.queueTransferResult(0xdeadbeef);

      const value = await adi.readMem32(0x10000010);

      expect(value).toBe(0xdeadbeef);
      // Should have generated ops for CSW, TAR, and DRW read
      const ops = dap.transferCalls[0];
      expect(ops.some((op) => op.register === AP_DRW && op.mode === READ)).toBe(
        true,
      );
    });

    it("writes a 32-bit value to memory", async () => {
      await adi.writeMem32(0x10000010, 0x12345678);

      const ops = dap.transferCalls[0];
      const drwWrite = ops.find(
        (op) => op.register === AP_DRW && op.mode === WRITE,
      );
      expect(drwWrite).toBeDefined();
      expect(drwWrite!.value).toBe(0x12345678);
    });
  });

  describe("register caching", () => {
    beforeEach(async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      dap.transferCalls.length = 0;
    });

    it("caches DP_SELECT and skips redundant writes", async () => {
      // First read: all ops including DP_SELECT
      await adi.readMem32(0x10000010);
      const firstCallOpCount = dap.transferCalls[0].length;

      // Second read at same address: DP_SELECT should be cached
      await adi.readMem32(0x10000010);
      const secondCallOpCount = dap.transferCalls[1].length;

      expect(secondCallOpCount).toBeLessThan(firstCallOpCount);
    });

    it("invalidates cache on transfer error", async () => {
      // First read succeeds, populating cache
      await adi.readMem32(0x10000010);

      // Second read: cache is warm, fewer ops
      await adi.readMem32(0x10000010);
      const cachedCallOpCount = dap.transferCalls[1].length;

      // Third read fails — this invalidates the cache
      vi.mocked(dap.transfer).mockRejectedValueOnce(new Error("fault"));
      await expect(adi.readMem32(0x10000010)).rejects.toThrow("fault");

      // Fourth read: cache should be invalidated, more ops than cached
      await adi.readMem32(0x10000010);
      const afterErrorOpCount = dap.transferCalls[2].length;

      expect(afterErrorOpCount).toBeGreaterThan(cachedCallOpCount);
    });
  });

  describe("readBlock", () => {
    beforeEach(async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      dap.transferCalls.length = 0;
    });

    it("reads a small block in a single chunk", async () => {
      dap.queueBlockReadResult(0x100, 0x200, 0x300);

      const result = await adi.readBlock(0x20000000, 3);

      expect(result.length).toBe(3);
      expect(result[0]).toBe(0x100);
      expect(result[1]).toBe(0x200);
      expect(result[2]).toBe(0x300);
      expect(dap.transferBlockRead).toHaveBeenCalledTimes(1);
    });

    it("splits reads at TAR auto-increment page boundaries", async () => {
      // Address near a 1KB boundary: 0x200003F0 is 0x10 (16) bytes from the
      // 1KB boundary at 0x20000400, so 4 words fit in the first page.
      const address = 0x200003f0;
      const count = 8; // 4 words in first page + 4 in next

      dap.queueBlockReadResult(1, 2, 3, 4);
      dap.queueBlockReadResult(5, 6, 7, 8);

      const result = await adi.readBlock(address, count);

      expect(result.length).toBe(8);
      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(dap.transferBlockRead).toHaveBeenCalledTimes(2);
    });
  });

  describe("writeBlock", () => {
    beforeEach(async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      dap.transferCalls.length = 0;
    });

    it("writes a small block in a single chunk", async () => {
      await adi.writeBlock(0x20000000, new Uint32Array([0xaa, 0xbb]));

      expect(dap.transferBlockWrite).toHaveBeenCalledTimes(1);
      const call = vi.mocked(dap.transferBlockWrite).mock.calls[0];
      expect(call[0]).toBe(AP);
      expect(call[1]).toBe(AP_DRW);
      expect(Array.from(call[2])).toEqual([0xaa, 0xbb]);
    });

    it("splits writes at TAR auto-increment page boundaries", async () => {
      const address = 0x200003f0; // 16 bytes (4 words) from 1KB boundary

      await adi.writeBlock(address, new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]));

      expect(dap.transferBlockWrite).toHaveBeenCalledTimes(2);
      const firstChunk = vi.mocked(dap.transferBlockWrite).mock.calls[0][2];
      const secondChunk = vi.mocked(dap.transferBlockWrite).mock.calls[1][2];
      expect(Array.from(firstChunk)).toEqual([1, 2, 3, 4]);
      expect(Array.from(secondChunk)).toEqual([5, 6, 7, 8]);
    });
  });

  describe("transferSequence", () => {
    beforeEach(async () => {
      setupConnectRegisters(dap);
      await adi.connect();
      dap.transferCalls.length = 0;
    });

    it("executes groups as separate transfers and concatenates results", async () => {
      const callsBefore = dap.transferCalls.length;

      dap.queueTransferResult(0x11);
      dap.queueTransferResult(0x22);

      const result = await adi.transferSequence([
        [{ port: DP, mode: READ, register: 0x00 }],
        [{ port: DP, mode: READ, register: 0x04 }],
      ]);

      // Two new transfer calls for our two groups
      expect(dap.transferCalls.length - callsBefore).toBe(2);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(0x11);
      expect(result[1]).toBe(0x22);
    });
  });

  describe("waitFor", () => {
    it("throws DeviceError on timeout", async () => {
      await expect(waitFor(() => Promise.resolve(false), 1)).rejects.toThrow(
        DeviceError,
      );
    });
  });

  describe("resetState", () => {
    it("allows reconnecting after reset", async () => {
      setupConnectRegisters(dap);
      await adi.connect();

      adi.resetState();

      // Should be able to connect again (connectOnce won't skip)
      setupConnectRegisters(dap);
      await adi.connect();

      // open called twice
      expect(dap.open).toHaveBeenCalledTimes(2);
    });
  });
});
