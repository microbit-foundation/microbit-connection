/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * Derived from dapjs (https://github.com/ARMmbed/dapjs) which is
 * Copyright (c) Arm Limited 2018
 * Copyright (c) Microsoft Corporation
 *
 * SPDX-License-Identifier: MIT
 *
 * CMSIS-DAP protocol layer. CmsisDap handles the framing and validation of
 * CMSIS-DAP commands over USB. It sits between UsbTransport (raw packet I/O)
 * and ArmDebugInterface (SWD register access). Its responsibilities are:
 *
 * - Serialising all DAP commands through a single queue so concurrent
 *   callers (serial polling, flash writes, SWD reads) don't interleave.
 * - Framing DAP_TRANSFER / DAP_TRANSFER_BLOCK requests and parsing their
 *   responses, including structured error reporting.
 * - Providing named wrappers for the low-level DAP commands used during
 *   SWD initialisation (SWJ_SEQUENCE, SWJ_CLOCK, etc.).
 * - Draining stale USB responses left over from a previous session.
 *
 * Protocol references:
 * - CMSIS-DAP: https://www.keil.com/pack/doc/CMSIS/DAP/html/group__DAP__Commands__gr.html
 * - ARM ADI: https://developer.arm.com/documentation/ihi0031/a/
 */

import { DeviceError } from "../device.js";
import { Logging } from "../logging.js";
import { PromiseQueue } from "../promise-queue.js";
import { UsbTransport, PACKET_SIZE } from "./transport.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// CMSIS-DAP commands
const DAP_INFO = 0x00;
const DAP_CONNECT = 0x02;
const DAP_DISCONNECT = 0x03;
const DAP_TRANSFER_CONFIGURE = 0x04;
const DAP_TRANSFER = 0x05;
const DAP_TRANSFER_BLOCK = 0x06;
const DAP_WRITE_ABORT = 0x08;
const DAP_SWJ_CLOCK = 0x11;
const DAP_SWJ_SEQUENCE = 0x12;

// DAP_CONNECT response
const DAP_CONNECT_FAILED = 0;

// DAP response statuses for commands that return OK/ERROR in byte 1
const DAP_OK = 0x00;

// Commands whose byte-1 response should be checked for OK
const STATUS_CHECK_COMMANDS = new Set([
  DAP_DISCONNECT,
  DAP_WRITE_ABORT,
  DAP_SWJ_CLOCK,
  DAP_SWJ_SEQUENCE,
  DAP_TRANSFER_CONFIGURE,
]);

// DAP_TRANSFER response codes (bitfield)
const TRANSFER_OK = 0x01;
const TRANSFER_WAIT = 0x02;
const TRANSFER_FAULT = 0x04;
const TRANSFER_ERROR = 0x08;
const TRANSFER_MISMATCH = 0x10;

// DAP ports
export const DP = 0x00; // Debug Port
export const AP = 0x01; // Access Port

// DAP transfer modes
export const READ = 0x02;
export const WRITE = 0x00;

// Abort register bits
const ABORT_STKCMPCLR = 1 << 1;
const ABORT_STKERRCLR = 1 << 2;
const ABORT_WDERRCLR = 1 << 3;
const ABORT_ORUNERRCLR = 1 << 4;
const ABORT_ALL =
  ABORT_WDERRCLR | ABORT_STKERRCLR | ABORT_STKCMPCLR | ABORT_ORUNERRCLR;

// Packet sizes
const BLOCK_HEADER_SIZE = 4;
const TRANSFER_HEADER_SIZE = 2;
const TRANSFER_OPERATION_SIZE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DAPOperation {
  port: number;
  mode: number;
  register: number;
  value?: number;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Base error for CMSIS-DAP protocol failures.
 * Extends DeviceError so existing catch blocks continue to work.
 */
export class DapError extends DeviceError {
  constructor(message: string) {
    super({ code: "reconnect-microbit", message });
  }
}

/**
 * The response command byte didn't match the request.
 * This can indicate stale responses in the USB buffer from a previous
 * interrupted session, or a protocol-level error.
 */
export class DapResponseMismatchError extends DapError {
  constructor(expected: number, actual: number) {
    super(`Bad response for ${expected} -> ${actual}`);
  }
}

/**
 * DAP transfer or block transfer failed with a non-OK response.
 */
export class DapTransferError extends DapError {
  constructor(
    public readonly response: number,
    public readonly completedOps: number,
    public readonly totalOps: number,
    prefix = "",
  ) {
    super(
      `${prefix}${transferResponseMessage(response)} at operation ${completedOps}/${totalOps}`,
    );
  }
}

// ---------------------------------------------------------------------------
// CmsisDap
// ---------------------------------------------------------------------------

export class CmsisDap {
  readonly blockSize: number;

  private sendQueue = new PromiseQueue();

  constructor(
    private transport: UsbTransport,
    private logging: Logging,
  ) {
    this.blockSize = PACKET_SIZE - BLOCK_HEADER_SIZE - 1;
  }

  get isOpen(): boolean {
    return this.transport.isOpen;
  }

  /**
   * Send a CMSIS-DAP command and validate the response.
   */
  async send(command: number, data?: Uint8Array): Promise<DataView> {
    let array: Uint8Array;
    if (data) {
      array = new Uint8Array(data.length + 1);
      array[0] = command;
      array.set(data, 1);
    } else {
      array = new Uint8Array([command]);
    }

    return this.sendQueue.add(async () => {
      await this.transport.write(array);
      const response = await this.transport.read();

      if (response.getUint8(0) !== command) {
        throw new DapResponseMismatchError(command, response.getUint8(0));
      }

      if (STATUS_CHECK_COMMANDS.has(command)) {
        if (response.getUint8(1) !== DAP_OK) {
          throw new DapError(
            `Bad status for ${command} -> ${response.getUint8(1)}`,
          );
        }
      }

      return response;
    });
  }

  async clearAbort(): Promise<void> {
    const data = new Uint8Array(5);
    new DataView(data.buffer).setUint32(1, ABORT_ALL, true);
    await this.send(DAP_WRITE_ABORT, data);
  }

  async swjSequence(data: Uint8Array): Promise<void> {
    const bitLength = data.byteLength * 8;
    const payload = new Uint8Array(data.length + 1);
    payload[0] = bitLength;
    payload.set(data, 1);
    await this.send(DAP_SWJ_SEQUENCE, payload);
  }

  async swjClock(frequency: number): Promise<void> {
    await this.send(
      DAP_SWJ_CLOCK,
      new Uint8Array(new Uint32Array([frequency]).buffer),
    );
  }

  async connect(): Promise<void> {
    const result = await this.send(DAP_CONNECT, new Uint8Array([0]));
    if (result.getUint8(1) === DAP_CONNECT_FAILED) {
      throw new DapError("Mode not enabled.");
    }
  }

  async disconnect(): Promise<void> {
    await this.send(DAP_DISCONNECT);
  }

  async configureTransfer(
    idleCycles: number,
    waitRetry: number,
    matchRetry: number,
  ): Promise<void> {
    const data = new Uint8Array(5);
    const view = new DataView(data.buffer);
    view.setUint8(0, idleCycles);
    view.setUint16(1, waitRetry, true);
    view.setUint16(3, matchRetry, true);
    await this.send(DAP_TRANSFER_CONFIGURE, data);
  }

  async open(): Promise<void> {
    await this.transport.open();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  /**
   * Execute a batch of DAP transfer operations (DAP_TRANSFER command).
   * Returns the values read (one per READ operation in the batch).
   */
  async transfer(operations: DAPOperation[]): Promise<Uint32Array> {
    if (operations.length === 0) {
      return new Uint32Array(0);
    }

    const data = new Uint8Array(
      TRANSFER_HEADER_SIZE + operations.length * TRANSFER_OPERATION_SIZE,
    );
    const view = new DataView(data.buffer);

    view.setUint8(0, 0); // DAP index (ignored for SWD)
    view.setUint8(1, operations.length);

    operations.forEach((op, index) => {
      const offset = TRANSFER_HEADER_SIZE + index * TRANSFER_OPERATION_SIZE;
      view.setUint8(offset, op.port | op.mode | op.register);
      view.setUint32(offset + 1, op.value ?? 0, true);
    });

    try {
      const result = await this.send(DAP_TRANSFER, data);

      const completedCount = result.getUint8(1);
      const response = result.getUint8(2);
      if (response !== TRANSFER_OK) {
        throw new DapTransferError(response, completedCount, operations.length);
      }
      if (completedCount !== operations.length) {
        throw new DapError(
          `Transfer count mismatch: expected ${operations.length}, got ${completedCount}`,
        );
      }

      const readCount = operations.filter((op) => op.mode === READ).length;
      return new Uint32Array(result.buffer.slice(3, 3 + readCount * 4));
    } catch (error) {
      await this.clearAbort();
      throw error;
    }
  }

  /**
   * Read a block of 32-bit values from a single register (DAP_TRANSFER_BLOCK).
   */
  async transferBlockRead(
    port: number,
    register: number,
    count: number,
  ): Promise<Uint32Array> {
    const maxWords = Math.floor(this.blockSize / 4);
    if (count > maxWords) {
      throw new DapError(
        `Transfer block read count ${count} exceeds max ${maxWords}`,
      );
    }
    const data = new Uint8Array(BLOCK_HEADER_SIZE);
    const view = new DataView(data.buffer);
    view.setUint8(0, 0);
    view.setUint16(1, count, true);
    view.setUint8(3, port | READ | register);

    try {
      const result = await this.send(DAP_TRANSFER_BLOCK, data);

      const completedCount = result.getUint16(1, true);
      const response = result.getUint8(3);
      if (response !== TRANSFER_OK) {
        throw new DapTransferError(
          response,
          completedCount,
          count,
          "Block read: ",
        );
      }
      if (completedCount !== count) {
        throw new DapError(
          `Block read count mismatch: expected ${count}, got ${completedCount}`,
        );
      }

      return new Uint32Array(result.buffer.slice(4, 4 + count * 4));
    } catch (error) {
      await this.clearAbort();
      throw error;
    }
  }

  /**
   * Write a block of 32-bit values to a single register (DAP_TRANSFER_BLOCK).
   */
  async transferBlockWrite(
    port: number,
    register: number,
    values: Uint32Array,
  ): Promise<void> {
    const maxWords = Math.floor(this.blockSize / 4);
    if (values.length > maxWords) {
      throw new DapError(
        `Transfer block write count ${values.length} exceeds max ${maxWords}`,
      );
    }
    const data = new Uint8Array(BLOCK_HEADER_SIZE + values.byteLength);
    const view = new DataView(data.buffer);
    view.setUint8(0, 0);
    view.setUint16(1, values.length, true);
    view.setUint8(3, port | WRITE | register);

    values.forEach((value, index) => {
      const offset = BLOCK_HEADER_SIZE + index * 4;
      view.setUint32(offset, value, true);
    });

    try {
      const result = await this.send(DAP_TRANSFER_BLOCK, data);

      const completedCount = result.getUint16(1, true);
      const response = result.getUint8(3);
      if (response !== TRANSFER_OK) {
        throw new DapTransferError(
          response,
          completedCount,
          values.length,
          "Block write: ",
        );
      }
      if (completedCount !== values.length) {
        throw new DapError(
          `Block write count mismatch: expected ${values.length}, got ${completedCount}`,
        );
      }
    } catch (error) {
      await this.clearAbort();
      throw error;
    }
  }

  /**
   * Drain stale responses from the USB buffer.
   * Sends DAP_INFO commands and reads until the response matches,
   * discarding any stale responses from interrupted operations.
   *
   * See: https://github.com/microbit-foundation/python-editor-v3/issues/89
   */
  async drainStaleResponses(): Promise<void> {
    return this.sendQueue.add(async () => {
      const maxAttempts = 10;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const packet = new Uint8Array([DAP_INFO, 0x01]);
        await this.transport.write(packet);

        const response = await this.transport.read();
        const responseBytes = new Uint8Array(response.buffer);

        if (responseBytes[0] === DAP_INFO) {
          for (let i = 0; i < attempt; i++) {
            await this.transport.read();
          }
          this.logging.log(
            `USB buffer drain: synchronized after ${attempt} stale response(s)`,
          );
          return;
        }
        this.logging.log(
          `USB buffer drain: discarded stale response 0x${responseBytes[0].toString(16)}`,
        );
      }

      this.logging.log(
        "USB buffer drain: warning - could not fully synchronize after max attempts",
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function transferResponseMessage(response: number): string {
  if (response === 0) return "Transfer failed (no ACK — target not responding)";
  if (response & TRANSFER_WAIT)
    return "Transfer WAIT (target busy, retries exhausted)";
  if (response & TRANSFER_FAULT) return "Transfer FAULT (access error)";
  if (response & TRANSFER_ERROR) return "Transfer protocol error";
  if (response & TRANSFER_MISMATCH) return "Transfer value mismatch";
  return `Transfer failed (response=0x${response.toString(16)})`;
}
