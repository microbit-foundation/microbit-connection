import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Transport, PACKET_SIZE } from "./transport.js";
import {
  CmsisDapUsb,
  DapError,
  DapResponseMismatchError,
  DapTransferError,
  DP,
  AP,
  READ,
  WRITE,
} from "./cmsis-dap.js";
import { ConsoleLogging } from "../logging.js";

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

class MockTransport implements Transport {
  isOpen = false;
  written: Uint8Array[] = [];
  responses: DataView[] = [];

  open = vi.fn(async () => {
    this.isOpen = true;
  });
  close = vi.fn(async () => {
    this.isOpen = false;
  });

  write = vi.fn(async (data: Uint8Array) => {
    this.written.push(new Uint8Array(data));
  });

  read = vi.fn(async (): Promise<DataView> => {
    const response = this.responses.shift();
    if (!response) {
      throw new Error("MockTransport: no responses queued");
    }
    return response;
  });

  /** Queue a raw response packet. */
  queueResponse(bytes: number[]): void {
    const buffer = new Uint8Array(PACKET_SIZE);
    buffer.set(bytes);
    this.responses.push(new DataView(buffer.buffer));
  }

  /** Queue a simple echo response (command byte + OK status). */
  queueOk(command: number): void {
    this.queueResponse([command, 0x00]);
  }

  /** Queue a DAP_TRANSFER response with OK status and read values. */
  queueTransferOk(opCount: number, readValues: number[] = []): void {
    const DAP_TRANSFER = 0x05;
    const buffer = new Uint8Array(PACKET_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, DAP_TRANSFER);
    view.setUint8(1, opCount); // completed count
    view.setUint8(2, 0x01); // TRANSFER_OK
    readValues.forEach((val, i) => {
      view.setUint32(3 + i * 4, val, true);
    });
    this.responses.push(new DataView(buffer.buffer));
  }

  /** Queue a DAP_TRANSFER_BLOCK read response. */
  queueBlockReadOk(count: number, values: number[]): void {
    const DAP_TRANSFER_BLOCK = 0x06;
    const buffer = new Uint8Array(PACKET_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, DAP_TRANSFER_BLOCK);
    view.setUint16(1, count, true);
    view.setUint8(3, 0x01); // TRANSFER_OK
    values.forEach((val, i) => {
      view.setUint32(4 + i * 4, val, true);
    });
    this.responses.push(new DataView(buffer.buffer));
  }

  /** Queue a DAP_TRANSFER_BLOCK write response. */
  queueBlockWriteOk(count: number): void {
    const DAP_TRANSFER_BLOCK = 0x06;
    const buffer = new Uint8Array(PACKET_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, DAP_TRANSFER_BLOCK);
    view.setUint16(1, count, true);
    view.setUint8(3, 0x01); // TRANSFER_OK
    this.responses.push(new DataView(buffer.buffer));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const logging = new ConsoleLogging();

describe("CmsisDapUsb", () => {
  let transport: MockTransport;
  let dap: CmsisDapUsb;

  beforeEach(() => {
    transport = new MockTransport();
    dap = new CmsisDapUsb(transport, logging);
  });

  describe("send", () => {
    it("frames command with no data", async () => {
      transport.queueOk(0x03); // DAP_DISCONNECT
      await dap.send(0x03);
      expect(transport.written.length).toBe(1);
      expect(transport.written[0][0]).toBe(0x03);
    });

    it("frames command with data payload", async () => {
      transport.queueOk(0x11); // DAP_SWJ_CLOCK
      await dap.send(0x11, new Uint8Array([0x01, 0x02, 0x03, 0x04]));
      const sent = transport.written[0];
      expect(sent[0]).toBe(0x11);
      expect(sent[1]).toBe(0x01);
      expect(sent[2]).toBe(0x02);
    });

    it("throws DapResponseMismatchError on wrong response command", async () => {
      transport.queueResponse([0xff]); // wrong command byte
      await expect(dap.send(0x03)).rejects.toThrow(DapResponseMismatchError);
    });

    it("throws DapError on bad status for status-checked commands", async () => {
      // DAP_DISCONNECT (0x03) is status-checked
      transport.queueResponse([0x03, 0x01]); // non-zero status
      await expect(dap.send(0x03)).rejects.toThrow(DapError);
    });

    it("does not check status for non-status-checked commands", async () => {
      // DAP_CONNECT (0x02) is not in STATUS_CHECK_COMMANDS
      transport.queueResponse([0x02, 0xff]); // non-zero byte 1 is fine
      const result = await dap.send(0x02);
      expect(result.getUint8(0)).toBe(0x02);
    });
  });

  describe("connect", () => {
    it("sends DAP_CONNECT and succeeds with non-zero port", async () => {
      transport.queueResponse([0x02, 0x01]); // SWD port
      await dap.connect();
      expect(transport.written[0][0]).toBe(0x02);
    });

    it("throws on DAP_CONNECT_FAILED (port 0)", async () => {
      transport.queueResponse([0x02, 0x00]);
      await expect(dap.connect()).rejects.toThrow("Mode not enabled");
    });
  });

  describe("swjClock", () => {
    it("sends frequency as little-endian uint32", async () => {
      transport.queueOk(0x11);
      await dap.swjClock(10_000_000);
      const sent = transport.written[0];
      expect(sent[0]).toBe(0x11);
      const freq = new DataView(sent.buffer).getUint32(1, true);
      expect(freq).toBe(10_000_000);
    });
  });

  describe("swjSequence", () => {
    it("prepends bit length to data", async () => {
      transport.queueOk(0x12);
      await dap.swjSequence(new Uint8Array([0xff, 0xff]));
      const sent = transport.written[0];
      expect(sent[0]).toBe(0x12);
      expect(sent[1]).toBe(16); // 2 bytes * 8 bits
      expect(sent[2]).toBe(0xff);
      expect(sent[3]).toBe(0xff);
    });
  });

  describe("configureTransfer", () => {
    it("sends idle cycles, wait retry, and match retry", async () => {
      transport.queueOk(0x04);
      await dap.configureTransfer(0, 100, 0);
      const sent = transport.written[0];
      expect(sent[0]).toBe(0x04);
      expect(sent[1]).toBe(0); // idle cycles
      const view = new DataView(sent.buffer);
      expect(view.getUint16(2, true)).toBe(100); // wait retry
      expect(view.getUint16(4, true)).toBe(0); // match retry
    });
  });

  describe("transfer", () => {
    it("returns empty array for empty operations", async () => {
      const result = await dap.transfer([]);
      expect(result.length).toBe(0);
      expect(transport.written.length).toBe(0);
    });

    it("frames a single write operation", async () => {
      transport.queueTransferOk(1);
      await dap.transfer([
        { port: DP, mode: WRITE, register: 0x04, value: 0x12345678 },
      ]);
      const sent = transport.written[0];
      expect(sent[0]).toBe(0x05); // DAP_TRANSFER
      expect(sent[1]).toBe(0x00); // DAP index
      expect(sent[2]).toBe(1); // op count
      // Operation byte: port | mode | register
      expect(sent[3]).toBe(DP | WRITE | 0x04);
      const view = new DataView(sent.buffer);
      expect(view.getUint32(4, true)).toBe(0x12345678);
    });

    it("returns read values", async () => {
      transport.queueTransferOk(1, [0xdeadbeef]);
      const result = await dap.transfer([
        { port: AP, mode: READ, register: 0x0c },
      ]);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(0xdeadbeef);
    });

    it("handles mixed read/write and returns only read values", async () => {
      transport.queueTransferOk(3, [0xaabbccdd, 0x11223344]);
      const result = await dap.transfer([
        { port: DP, mode: WRITE, register: 0x08, value: 0 },
        { port: AP, mode: READ, register: 0x00 },
        { port: AP, mode: READ, register: 0x0c },
      ]);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(0xaabbccdd);
      expect(result[1]).toBe(0x11223344);
    });

    it("throws DapTransferError on FAULT response and clears abort", async () => {
      // Transfer response: FAULT
      const buffer = new Uint8Array(PACKET_SIZE);
      const view = new DataView(buffer.buffer);
      view.setUint8(0, 0x05);
      view.setUint8(1, 0); // completed 0
      view.setUint8(2, 0x04); // TRANSFER_FAULT
      transport.responses.push(new DataView(buffer.buffer));
      // clearAbort sends DAP_WRITE_ABORT (0x08), queue its response
      transport.queueOk(0x08);

      await expect(
        dap.transfer([{ port: DP, mode: READ, register: 0x00 }]),
      ).rejects.toThrow(DapTransferError);

      // Verify clearAbort was called
      expect(transport.written.length).toBe(2);
      expect(transport.written[1][0]).toBe(0x08);
    });

    it("throws on completed count mismatch", async () => {
      const buffer = new Uint8Array(PACKET_SIZE);
      const view = new DataView(buffer.buffer);
      view.setUint8(0, 0x05);
      view.setUint8(1, 0); // completed 0 but we sent 1
      view.setUint8(2, 0x01); // TRANSFER_OK
      transport.responses.push(new DataView(buffer.buffer));
      transport.queueOk(0x08); // clearAbort

      await expect(
        dap.transfer([{ port: DP, mode: READ, register: 0x00 }]),
      ).rejects.toThrow("Transfer count mismatch");
    });
  });

  describe("transferBlockRead", () => {
    it("reads a block of values", async () => {
      transport.queueBlockReadOk(3, [0x100, 0x200, 0x300]);
      const result = await dap.transferBlockRead(AP, 0x0c, 3);
      expect(result.length).toBe(3);
      expect(result[0]).toBe(0x100);
      expect(result[1]).toBe(0x200);
      expect(result[2]).toBe(0x300);

      const sent = transport.written[0];
      expect(sent[0]).toBe(0x06); // DAP_TRANSFER_BLOCK
      // send() prepends command byte, so data[3] (the operation byte) is at sent[4]
      expect(sent[4]).toBe(AP | READ | 0x0c);
    });

    it("throws on count exceeding block size", async () => {
      const maxWords = Math.floor(dap.blockSize / 4);
      await expect(
        dap.transferBlockRead(AP, 0x0c, maxWords + 1),
      ).rejects.toThrow("exceeds max");
    });

    it("throws DapTransferError on WAIT response", async () => {
      const buffer = new Uint8Array(PACKET_SIZE);
      const view = new DataView(buffer.buffer);
      view.setUint8(0, 0x06);
      view.setUint16(1, 0, true);
      view.setUint8(3, 0x02); // TRANSFER_WAIT
      transport.responses.push(new DataView(buffer.buffer));
      transport.queueOk(0x08); // clearAbort

      await expect(dap.transferBlockRead(AP, 0x0c, 1)).rejects.toThrow(
        DapTransferError,
      );
    });
  });

  describe("transferBlockWrite", () => {
    it("writes a block of values", async () => {
      transport.queueBlockWriteOk(2);
      await dap.transferBlockWrite(AP, 0x0c, new Uint32Array([0xaa, 0xbb]));

      const sent = transport.written[0];
      expect(sent[0]).toBe(0x06); // DAP_TRANSFER_BLOCK
      const view = new DataView(sent.buffer);
      // send() prepends command byte, so data offsets shift by 1:
      // sent[0]=cmd, sent[1]=dap_index, sent[2..3]=count, sent[4]=op, sent[5..]=values
      expect(view.getUint16(2, true)).toBe(2); // count
      expect(sent[4]).toBe(AP | WRITE | 0x0c); // op byte
      expect(view.getUint32(5, true)).toBe(0xaa);
      expect(view.getUint32(9, true)).toBe(0xbb);
    });

    it("throws on count exceeding block size", async () => {
      const maxWords = Math.floor(dap.blockSize / 4);
      await expect(
        dap.transferBlockWrite(AP, 0x0c, new Uint32Array(maxWords + 1)),
      ).rejects.toThrow("exceeds max");
    });
  });

  describe("drainStaleResponses", () => {
    it("synchronizes immediately when first response matches", async () => {
      // DAP_INFO response
      transport.queueResponse([0x00, 0x03, 0x30, 0x2e, 0x31]);
      await dap.drainStaleResponses();
      expect(transport.written.length).toBe(1);
      expect(transport.written[0][0]).toBe(0x00); // DAP_INFO
    });

    it("drains stale responses before synchronizing", async () => {
      // First read returns stale response (e.g. from a previous DAP_TRANSFER)
      transport.queueResponse([0x05, 0x01, 0x01]);
      // Second read returns the DAP_INFO response
      transport.queueResponse([0x00, 0x03, 0x30, 0x2e, 0x31]);
      // One extra read to drain the queued DAP_INFO from attempt 0
      transport.queueResponse([0x00, 0x03, 0x30, 0x2e, 0x31]);

      await dap.drainStaleResponses();

      // 2 DAP_INFO writes + 3 reads
      expect(transport.write).toHaveBeenCalledTimes(2);
      expect(transport.read).toHaveBeenCalledTimes(3);
    });
  });

  describe("open and close", () => {
    it("delegates to transport", async () => {
      await dap.open();
      expect(transport.open).toHaveBeenCalled();
      expect(dap.isOpen).toBe(true);

      await dap.close();
      expect(transport.close).toHaveBeenCalled();
      expect(dap.isOpen).toBe(false);
    });
  });

  describe("blockSize", () => {
    it("is PACKET_SIZE minus header minus command byte", () => {
      // PACKET_SIZE (64) - BLOCK_HEADER_SIZE (4) - 1 = 59
      expect(dap.blockSize).toBe(59);
    });
  });
});
