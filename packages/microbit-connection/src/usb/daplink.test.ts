import { describe, it, expect, vi, beforeEach } from "vitest";
import { type CmsisDap, DapTransferError } from "./cmsis-dap.js";
import { type ArmDebug } from "./arm-debug.js";
import { ConsoleLogging } from "../logging.js";
import {
  DAPLINK_VENDOR_READ_UNIQUE_ID,
  DAPLINK_VENDOR_READ_SETTINGS,
  DAPLINK_VENDOR_SERIAL_READ,
  DAPLINK_VENDOR_SERIAL_WRITE,
  DAPLINK_VENDOR_WRITE_SETTINGS,
  DAPLINK_VENDOR_FLASH_CLOSE,
  DAPLINK_VENDOR_FLASH_OPEN,
  DAPLINK_VENDOR_FLASH_RESET,
  DAPLINK_VENDOR_FLASH_WRITE,
  DapLinkSerial,
  dapLinkFlash,
  readDaplinkUniqueId,
  readMem32WithRetry,
} from "./daplink.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const logging = new ConsoleLogging();

/** Create a DataView response with a command echo and status/length byte. */
function makeResponse(
  command: number,
  secondByte: number,
  extraBytes: number[] = [],
): DataView {
  const buf = new ArrayBuffer(64);
  const view = new DataView(buf);
  view.setUint8(0, command);
  view.setUint8(1, secondByte);
  extraBytes.forEach((b, i) => view.setUint8(2 + i, b));
  return view;
}

function createMockDap(): CmsisDap {
  return {
    isOpen: true,
    blockSize: 59,
    send: vi.fn(),
    clearAbort: vi.fn(),
    swjSequence: vi.fn(),
    swjClock: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    configureTransfer: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    transfer: vi.fn(),
    transferBlockRead: vi.fn(),
    transferBlockWrite: vi.fn(),
    drainStaleResponses: vi.fn(),
  };
}

function createMockAdi(dap: CmsisDap): ArmDebug {
  return {
    dap,
    get isOpen() {
      return true;
    },
    readMem32: vi.fn(),
    writeMem32: vi.fn(),
    readMem32Ops: vi.fn(() => []),
    writeMem32Ops: vi.fn(() => []),
    readBlock: vi.fn(),
    writeBlock: vi.fn(),
    transferSequence: vi.fn(),
    resetState: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    reinit: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// DapLinkSerial
// ---------------------------------------------------------------------------

describe("DapLinkSerial", () => {
  let dap: CmsisDap;
  let serial: DapLinkSerial;

  beforeEach(() => {
    dap = createMockDap();
    serial = new DapLinkSerial(dap, logging);
  });

  describe("getBaudrate", () => {
    it("reads baud rate from READ_SETTINGS response", async () => {
      const response = new DataView(new ArrayBuffer(64));
      response.setUint8(0, DAPLINK_VENDOR_READ_SETTINGS);
      response.setUint32(1, 115200, true);
      vi.mocked(dap.send).mockResolvedValueOnce(response);

      const baud = await serial.getBaudrate();

      expect(baud).toBe(115200);
      expect(dap.send).toHaveBeenCalledWith(DAPLINK_VENDOR_READ_SETTINGS);
    });
  });

  describe("setBaudrate", () => {
    it("sends baud rate via WRITE_SETTINGS", async () => {
      vi.mocked(dap.send).mockResolvedValueOnce(
        new DataView(new ArrayBuffer(64)),
      );

      await serial.setBaudrate(9600);

      expect(dap.send).toHaveBeenCalledWith(
        DAPLINK_VENDOR_WRITE_SETTINGS,
        expect.any(Uint8Array),
      );
      const payload = vi.mocked(dap.send).mock.calls[0][1]!;
      const sentBaud = new DataView(payload.buffer).getUint32(0, true);
      expect(sentBaud).toBe(9600);
    });
  });

  describe("read", () => {
    it("returns decoded string when data is available", async () => {
      const text = "Hi";
      const encoded = new TextEncoder().encode(text);
      const response = new DataView(new ArrayBuffer(64));
      response.setUint8(0, DAPLINK_VENDOR_SERIAL_READ);
      response.setUint8(1, encoded.length);
      encoded.forEach((b, i) => response.setUint8(2 + i, b));
      vi.mocked(dap.send).mockResolvedValueOnce(response);

      const result = await serial.read();

      expect(result).toBe("Hi");
    });

    it("returns undefined when no data", async () => {
      vi.mocked(dap.send).mockResolvedValueOnce(
        makeResponse(DAPLINK_VENDOR_SERIAL_READ, 0),
      );

      const result = await serial.read();

      expect(result).toBeUndefined();
    });
  });

  describe("write", () => {
    it("sends encoded string with length prefix", async () => {
      vi.mocked(dap.send).mockResolvedValueOnce(
        new DataView(new ArrayBuffer(64)),
      );

      await serial.write("AB");

      expect(dap.send).toHaveBeenCalledWith(
        DAPLINK_VENDOR_SERIAL_WRITE,
        expect.any(Uint8Array),
      );
      const payload = vi.mocked(dap.send).mock.calls[0][1]!;
      expect(payload[0]).toBe(2); // length
      expect(payload[1]).toBe(0x41); // 'A'
      expect(payload[2]).toBe(0x42); // 'B'
    });
  });

  describe("drain", () => {
    it("reads until empty", async () => {
      // Two reads with data, then one empty
      const text = new TextEncoder().encode("x");
      const withData = new DataView(new ArrayBuffer(64));
      withData.setUint8(1, 1);
      withData.setUint8(2, text[0]);

      vi.mocked(dap.send)
        .mockResolvedValueOnce(withData)
        .mockResolvedValueOnce(withData)
        .mockResolvedValueOnce(makeResponse(0, 0)); // empty

      await serial.drain();

      expect(dap.send).toHaveBeenCalledTimes(3);
    });

    it("does nothing when already empty", async () => {
      vi.mocked(dap.send).mockResolvedValueOnce(makeResponse(0, 0));

      await serial.drain();

      expect(dap.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("startPolling / stopPolling", () => {
    it("calls onData for each read and stops when requested", async () => {
      const received: string[] = [];
      let callCount = 0;

      vi.mocked(dap.send).mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          const resp = new DataView(new ArrayBuffer(64));
          resp.setUint8(1, 1);
          resp.setUint8(2, 0x41 + callCount - 1); // 'A', 'B'
          return resp;
        }
        // After 2 data reads, stop polling
        serial.stopPolling();
        return makeResponse(0, 0);
      });

      await serial.startPolling((data) => received.push(data), 0);

      expect(received).toEqual(["A", "B"]);
    });
  });
});

// ---------------------------------------------------------------------------
// dapLinkFlash
// ---------------------------------------------------------------------------

describe("dapLinkFlash", () => {
  let dap: CmsisDap;
  let adi: ArmDebug;

  beforeEach(() => {
    dap = createMockDap();
    adi = createMockAdi(dap);
  });

  it("streams hex data in 62-byte pages", async () => {
    // 124 bytes = 2 full pages
    const buffer = new Uint8Array(124);
    buffer.fill(0x3a); // ':' characters (Intel HEX)

    vi.mocked(dap.send)
      // FLASH_OPEN → success
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_OPEN, 0))
      // FLASH_WRITE page 1 → success
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_WRITE, 0))
      // FLASH_WRITE page 2 → success
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_WRITE, 0))
      // FLASH_CLOSE → success
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_CLOSE, 0))
      // FLASH_RESET
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_RESET, 0));

    const progress = vi.fn();
    await dapLinkFlash(adi, buffer, progress);

    // OPEN + 2 WRITE + CLOSE + RESET = 5 sends
    expect(dap.send).toHaveBeenCalledTimes(5);
    // Progress called for each page + final 1.0
    expect(progress).toHaveBeenCalledWith(1.0);
    // resetState called in finally
    expect(adi.resetState).toHaveBeenCalled();
  });

  it("stops early on ERROR_SUCCESS_DONE", async () => {
    const buffer = new Uint8Array(124);

    vi.mocked(dap.send)
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_OPEN, 0))
      // First page returns DONE (18)
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_WRITE, 18))
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_CLOSE, 0))
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_RESET, 0));

    await dapLinkFlash(adi, buffer);

    // Only 1 write (stopped at DONE), then CLOSE + RESET
    expect(dap.send).toHaveBeenCalledTimes(4);
  });

  it("throws on FLASH_OPEN error", async () => {
    vi.mocked(dap.send).mockResolvedValueOnce(
      makeResponse(DAPLINK_VENDOR_FLASH_OPEN, 5), // error status
    );

    await expect(dapLinkFlash(adi, new Uint8Array(10))).rejects.toThrow(
      "Flash open error",
    );

    // The throw happens before the try/finally block, so resetState is not called.
    expect(adi.resetState).not.toHaveBeenCalled();
  });

  it("throws on FLASH_CLOSE error and attempts cleanup", async () => {
    const buffer = new Uint8Array(10);

    vi.mocked(dap.send)
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_OPEN, 0))
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_WRITE, 0))
      // FLASH_CLOSE returns error
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_CLOSE, 7))
      // Cleanup FLASH_CLOSE in catch
      .mockResolvedValueOnce(makeResponse(DAPLINK_VENDOR_FLASH_CLOSE, 0));

    await expect(dapLinkFlash(adi, buffer)).rejects.toThrow(
      "Flash close error",
    );
    expect(adi.resetState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readDaplinkUniqueId
// ---------------------------------------------------------------------------

describe("readDaplinkUniqueId", () => {
  let dap: CmsisDap;

  beforeEach(() => {
    dap = createMockDap();
  });

  it("returns the unique ID string", async () => {
    const id = "9900012345678901234567890123456789012345678901234";
    const encoded = new TextEncoder().encode(id);
    const response = new DataView(new ArrayBuffer(64));
    response.setUint8(0, DAPLINK_VENDOR_READ_UNIQUE_ID);
    response.setUint8(1, encoded.length);
    encoded.forEach((b, i) => response.setUint8(2 + i, b));
    vi.mocked(dap.send).mockResolvedValueOnce(response);

    const result = await readDaplinkUniqueId(dap, logging);

    expect(result).toBe(id);
  });

  it("returns undefined for zero-length response", async () => {
    vi.mocked(dap.send).mockResolvedValueOnce(
      makeResponse(DAPLINK_VENDOR_READ_UNIQUE_ID, 0),
    );

    const result = await readDaplinkUniqueId(dap, logging);

    expect(result).toBeUndefined();
  });

  it("returns undefined on error", async () => {
    vi.mocked(dap.send).mockRejectedValueOnce(new Error("USB gone"));

    const result = await readDaplinkUniqueId(dap, logging);

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readMem32WithRetry
// ---------------------------------------------------------------------------

describe("readMem32WithRetry", () => {
  let dap: CmsisDap;
  let adi: ArmDebug;

  beforeEach(() => {
    dap = createMockDap();
    adi = createMockAdi(dap);
  });

  it("returns value on first success", async () => {
    vi.mocked(adi.readMem32).mockResolvedValueOnce(0xdeadbeef);

    const value = await readMem32WithRetry(adi, 0x10000010, logging);

    expect(value).toBe(0xdeadbeef);
    expect(adi.readMem32).toHaveBeenCalledTimes(1);
  });

  it("retries on DapTransferError", async () => {
    vi.mocked(adi.readMem32)
      .mockRejectedValueOnce(new DapTransferError(0x04, 0, 1))
      .mockRejectedValueOnce(new DapTransferError(0x04, 0, 1))
      .mockResolvedValueOnce(0x42);

    const value = await readMem32WithRetry(adi, 0x10000010, logging, 5, 0);

    expect(value).toBe(0x42);
    expect(adi.readMem32).toHaveBeenCalledTimes(3);
  });

  it("throws non-transfer errors immediately", async () => {
    vi.mocked(adi.readMem32).mockRejectedValueOnce(new Error("USB gone"));

    await expect(
      readMem32WithRetry(adi, 0x10000010, logging, 5, 0),
    ).rejects.toThrow("USB gone");

    expect(adi.readMem32).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    vi.mocked(adi.readMem32).mockRejectedValue(
      new DapTransferError(0x04, 0, 1),
    );

    await expect(
      readMem32WithRetry(adi, 0x10000010, logging, 3, 0),
    ).rejects.toThrow(DapTransferError);

    expect(adi.readMem32).toHaveBeenCalledTimes(3);
  });
});
