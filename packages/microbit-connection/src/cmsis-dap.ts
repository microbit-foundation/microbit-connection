/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * CMSIS-DAP protocol implementation for WebUSB, derived from dapjs
 * (https://github.com/ARMmbed/dapjs). This is a minimal implementation
 * covering only the features needed for micro:bit: SWD transport,
 * DAPLink serial/flash, and Cortex-M processor control.
 *
 * Notable additions:
 * - drain() to synchronise USB buffer
 * - Structured DapTransferError with per-operation failure detail
 * - Single queue serialising all DAP commands (serial, flash, SWD)
 * - invalidate() to reset cached state without closing USB transport
 *
 * The dapjs license is included below.
 *
 * DAPjs
 * Copyright (c) Arm Limited 2018
 * Copyright (c) Microsoft Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 * Protocol references:
 * - CMSIS-DAP: https://www.keil.com/pack/doc/CMSIS/DAP/html/group__DAP__Commands__gr.html
 * - ARM ADI: https://developer.arm.com/documentation/ihi0031/a/
 * - DAPLink: https://github.com/ARMmbed/DAPLink
 */

import { DapLinkVendorCmd } from "./constants.js";
import { DeviceError } from "./device.js";
import { Logging } from "./logging.js";
import { PromiseQueue } from "./promise-queue.js";

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
const DP = 0x00; // Debug Port
const AP = 0x01; // Access Port

// DAP transfer modes
const READ = 0x02;
const WRITE = 0x00;

// DP registers
const DP_ABORT = 0x0;
const DP_DPIDR = 0x0;
const DP_CTRL_STAT = 0x4;
const DP_SELECT = 0x8;

// AP registers (values are byte addresses, pre-shifted to match the DAP
// transfer operation encoding where bits [3:2] carry A[3:2])
const AP_CSW = 0x00;
const AP_TAR = 0x04;
const AP_DRW = 0x0c;

// CSW mask values
const CSW_SIZE32 = 1 << 1;
const CSW_ADDRINC_SINGLE = 1 << 4;
const CSW_DBGSTATUS = 1 << 6;
const CSW_RESERVED = 1 << 24;
const CSW_HPROT1 = 1 << 25;
const CSW_MASTERTYPE = 1 << 29;
const CSW_VALUE =
  CSW_ADDRINC_SINGLE |
  CSW_DBGSTATUS |
  CSW_RESERVED |
  CSW_HPROT1 |
  CSW_MASTERTYPE;

// Bank select masks
const APSEL = 0xff000000;
const APBANKSEL = 0x000000f0;

// Abort register bits
const ABORT_STKCMPCLR = 1 << 1;
const ABORT_STKERRCLR = 1 << 2;
const ABORT_WDERRCLR = 1 << 3;
const ABORT_ORUNERRCLR = 1 << 4;
const ABORT_ALL =
  ABORT_WDERRCLR | ABORT_STKERRCLR | ABORT_STKCMPCLR | ABORT_ORUNERRCLR;

// CTRL/STAT register bits
const CSYSPWRUPREQ = 1 << 30;
const CDBGPWRUPREQ = 1 << 28;
const CSYSPWRUPACK = 1 << 31;
const CDBGPWRUPACK = 1 << 29;

// SWD protocol sequence
const SWD_SEQUENCE = 0xe79e;

// Debug registers
const DFSR = 0xe000ed30;
const DHCSR = 0xe000edf0;
const DCRSR = 0xe000edf4;
const DCRDR = 0xe000edf8;

// DHCSR bits
const C_DEBUGEN = 1 << 0;
const C_HALT = 1 << 1;
const S_REGRDY = 1 << 16;
const S_HALT = 1 << 17;
const DBGKEY = 0xa05f << 16;

// DFSR bits
const DFSR_HALTED = 1 << 0;
const DFSR_BKPT = 1 << 1;
const DFSR_DWTTRAP = 1 << 2;

// DCRSR bits
const REGWnR = 1 << 16;

// Clock frequency (10 MHz)
const CLOCK_FREQUENCY = 10_000_000;

// WebUSB interface class for CMSIS-DAP
const CMSIS_DAP_INTERFACE_CLASS = 0xff;

// HID report types for control transfer fallback (CMSIS-DAP v1 / no bulk endpoints)
const GET_REPORT = 0x01;
const SET_REPORT = 0x09;
const OUT_REPORT = 0x200;
const IN_REPORT = 0x100;

// Packet sizes
const PACKET_SIZE = 64;
const BLOCK_HEADER_SIZE = 4;
const TRANSFER_HEADER_SIZE = 2;
const TRANSFER_OPERATION_SIZE = 5;

// TAR auto-increment page size (1KB, implementation-defined minimum)
const AUTOINC_PAGESIZE = 1 << 10;

// DAPLink stream error codes (error_t in DAPLink's error.h).
// stream_write returns these to indicate success variants.
const DAPLINK_ERROR_SUCCESS = 0;
const DAPLINK_ERROR_SUCCESS_DONE = 18;

// Default flash page size for DAPLink write chunks
const DAPLINK_FLASH_PAGE_SIZE = 62;

// Wait delay for polling loops
const WAIT_DELAY = 100;

// Debug registers — Cortex-M system control
const DEMCR = 0xe000edfc;
const DEMCR_VC_CORERESET = 1 << 0;
const NVIC_AIRCR = 0xe000ed0c;
const NVIC_AIRCR_VECTKEY = 0x5fa << 16;
const NVIC_AIRCR_SYSRESETREQ = 1 << 2;
const S_RESET_ST = 1 << 25;

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
// Shared utilities
// ---------------------------------------------------------------------------

async function waitFor(
  fn: () => Promise<boolean>,
  timeout = 10_000,
): Promise<void> {
  const deadline = timeout > 0 ? Date.now() + timeout : 0;
  while (true) {
    if (await fn()) return;
    if (deadline && Date.now() > deadline) {
      throw new DeviceError({
        code: "timeout-error",
        message: "Wait timed out",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_DELAY));
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DAPOperation {
  port: number;
  mode: number;
  register: number;
  value?: number;
}

// ---------------------------------------------------------------------------
// CmsisDap — WebUSB transport + CMSIS-DAP protocol + ARM Debug Interface
// ---------------------------------------------------------------------------

export class CmsisDap {
  connected = false;

  private readonly blockSize: number;

  // Transport state
  private interfaceNumber?: number;
  private endpointIn?: USBEndpoint;
  private endpointOut?: USBEndpoint;

  // Protocol state
  private sendQueue = new PromiseQueue();

  // ADI state (register caching)
  private selectedAddress?: number;
  private cswValue?: number;

  constructor(
    private device: USBDevice,
    private logging: Logging,
  ) {
    this.blockSize = PACKET_SIZE - BLOCK_HEADER_SIZE - 1;
  }

  /**
   * Whether the USB transport is open (interface claimed).
   */
  get isOpen(): boolean {
    return this.interfaceNumber !== undefined;
  }

  // ---- Transport layer ----

  async open(): Promise<void> {
    if (this.isOpen) return;

    await this.device.open();
    await this.device.selectConfiguration(1);

    const interfaces = this.device.configuration!.interfaces.filter(
      (iface) =>
        iface.alternates[0].interfaceClass === CMSIS_DAP_INTERFACE_CLASS,
    );

    if (!interfaces.length) {
      throw new DeviceError({
        code: "update-req",
        message: "No valid interfaces found.",
      });
    }

    // Prefer interface with bulk endpoints (CMSIS-DAP v2).
    // Fall back to an interface without endpoints (CMSIS-DAP v1 / HID),
    // which will use control transfers instead.
    const selectedInterface =
      interfaces.find((iface) => iface.alternates[0].endpoints.length > 0) ??
      interfaces[0];

    this.interfaceNumber = selectedInterface.interfaceNumber;

    const endpoints = selectedInterface.alternates[0].endpoints;
    this.endpointIn = undefined;
    this.endpointOut = undefined;
    for (const endpoint of endpoints) {
      if (endpoint.direction === "in" && !this.endpointIn)
        this.endpointIn = endpoint;
      else if (endpoint.direction === "out" && !this.endpointOut)
        this.endpointOut = endpoint;
    }

    await this.device.claimInterface(this.interfaceNumber);
  }

  async close(): Promise<void> {
    this.interfaceNumber = undefined;
    this.endpointIn = undefined;
    this.endpointOut = undefined;
    await this.device.close();
  }

  private async read(): Promise<DataView> {
    if (this.interfaceNumber === undefined) {
      throw new DapError("No device opened");
    }

    let result: USBInTransferResult;
    if (this.endpointIn) {
      result = await this.device.transferIn(
        this.endpointIn.endpointNumber,
        PACKET_SIZE,
      );
    } else {
      // Control transfer fallback for interfaces without bulk endpoints
      result = await this.device.controlTransferIn(
        {
          requestType: "class",
          recipient: "interface",
          request: GET_REPORT,
          value: IN_REPORT,
          index: this.interfaceNumber,
        },
        PACKET_SIZE,
      );
    }
    if (result.status !== "ok" || !result.data) {
      throw new DapError("USB read failed");
    }
    return result.data;
  }

  private async write(data: Uint8Array): Promise<void> {
    if (this.interfaceNumber === undefined) {
      throw new DapError("No device opened");
    }

    // Always pad to PACKET_SIZE (required for HID control transfer fallback)
    const buffer = new Uint8Array(PACKET_SIZE);
    buffer.set(data.subarray(0, PACKET_SIZE));

    if (this.endpointOut) {
      await this.device.transferOut(this.endpointOut.endpointNumber, buffer);
    } else {
      // Control transfer fallback for interfaces without bulk endpoints
      await this.device.controlTransferOut(
        {
          requestType: "class",
          recipient: "interface",
          request: SET_REPORT,
          value: OUT_REPORT,
          index: this.interfaceNumber,
        },
        buffer,
      );
    }
  }

  // ---- CMSIS-DAP protocol layer ----

  /**
   * Send a CMSIS-DAP command and validate the response.
   * Exposed as public for low-level use (e.g. vendor commands, drain logic).
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
      await this.write(array);
      const response = await this.read();

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

  private async clearAbort(): Promise<void> {
    // DAP_WRITE_ABORT: [DAP_index(1), abort_value(4 LE)]
    const data = new Uint8Array(5);
    new DataView(data.buffer).setUint32(1, ABORT_ALL, true);
    await this.send(DAP_WRITE_ABORT, data);
  }

  // ---- Connect/disconnect ----

  /**
   * Connect to the target via SWD, initialize the debug port,
   * and power up the debug and system domains.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    await this.open();

    // SWD protocol setup. On failure the transport is left open so the
    // caller can drain stale responses and retry without re-opening.
    try {
      // Set clock frequency
      await this.send(
        DAP_SWJ_CLOCK,
        new Uint8Array(new Uint32Array([CLOCK_FREQUENCY]).buffer),
      );

      // Connect in default mode
      const connectResult = await this.send(DAP_CONNECT, new Uint8Array([0]));
      if (connectResult.getUint8(1) === DAP_CONNECT_FAILED) {
        throw new DapError("Mode not enabled.");
      }
    } catch (error) {
      try {
        await this.clearAbort();
      } catch {
        /* ignore */
      }
      throw error;
    }

    // Configure transfer: 0 idle cycles, 100 wait retries, 0 match retries
    const configData = new Uint8Array(5);
    const configView = new DataView(configData.buffer);
    configView.setUint8(0, 0);
    configView.setUint16(1, 100, true);
    configView.setUint16(3, 0, true);
    await this.send(DAP_TRANSFER_CONFIGURE, configData);

    // Select SWD protocol
    await this.swjSequence(
      new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );
    await this.swjSequence(
      new Uint8Array(new Uint16Array([SWD_SEQUENCE]).buffer),
    );
    await this.swjSequence(
      new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );
    await this.swjSequence(new Uint8Array([0x00]));

    this.connected = true;

    // ADI: Initialize debug port and power up
    try {
      await this.readDP(DP_DPIDR);

      // Clear sticky errors, select CSW, request power-up
      await this.transferSequence([
        this.writeDPOps(DP_ABORT, ABORT_ALL),
        this.writeDPOps(DP_SELECT, AP_CSW),
        this.writeDPOps(DP_CTRL_STAT, CSYSPWRUPREQ | CDBGPWRUPREQ),
      ]);

      // Wait until both system and debug have powered up
      const mask = CDBGPWRUPACK | CSYSPWRUPACK;
      await waitFor(async () => {
        const status = await this.readDP(DP_CTRL_STAT);
        return (status & mask) === mask;
      }, 5000);
    } catch (error) {
      await this.disconnect();
      throw error;
    }
    this.logging.log("SWD connected");
  }

  /**
   * Connect with automatic drain-and-retry on stale USB responses.
   * After a page reload or interrupted session, stale responses from the
   * previous session may be sitting in the USB buffer. connect() leaves the
   * transport open on failure so we can drain and retry.
   * See: https://github.com/microbit-foundation/python-editor-v3/issues/89
   */
  async connectWithRetry(maxRetries = 3): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logging.log(
            `Connection retry attempt ${attempt + 1}/${maxRetries}`,
          );
          await this.drain();
        }
        await this.connect();
        return;
      } catch (e) {
        if (e instanceof DapResponseMismatchError) {
          lastError = e;
          this.logging.log(`Stale response during connect: ${e.message}`);
          continue;
        }
        throw e;
      }
    }
    throw lastError || new Error("Connection failed after retries");
  }

  /**
   * Invalidate cached protocol state without closing the USB transport.
   * Call after operations that reset the target (e.g. DAPLink flash reset).
   */
  invalidate(): void {
    this.connected = false;
    this.selectedAddress = undefined;
    this.cswValue = undefined;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.send(DAP_DISCONNECT);
    } catch {
      this.logging.log("Disconnect failed, clearing abort");
      try {
        await this.clearAbort();
      } catch {
        /* ignore */
      }
    }
    await this.close();
    this.invalidate();
    this.logging.log("SWD disconnected");
  }

  /**
   * Invalidate cached state and reconnect SWD without closing the USB
   * transport. Use after operations like DAPLink flash that leave the
   * protocol state stale but don't require full re-enumeration.
   */
  async reinitSwd(): Promise<void> {
    this.logging.log("Reinitialising SWD");
    this.invalidate();
    await this.connect();
  }

  /**
   * Read a 32-bit word from memory, retrying on transfer errors.
   * Useful for reads immediately after reset when the target may not
   * be ready to respond.
   */
  async readMem32WithRetry(
    address: number,
    maxRetries = 20,
    delayMs = 20,
  ): Promise<number> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const value = await this.readMem32(address);
        if (attempt > 0) {
          this.logging.log(
            `readMem32(0x${address.toString(16)}) succeeded after ${attempt + 1} attempts`,
          );
        }
        return value;
      } catch (e) {
        if (e instanceof DapTransferError) {
          lastError = e;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw e;
        }
      }
    }
    throw lastError;
  }

  /**
   * Read the DAPLink unique ID via vendor command 0x80.
   * Returns the same 48-char hex string as the USB serial number
   * but isn't affected by browser anti-fingerprinting.
   */
  async readDaplinkSerial(): Promise<string | undefined> {
    try {
      const result = await this.send(DapLinkVendorCmd.READ_UNIQUE_ID);
      const length = result.getUint8(1);
      if (length === 0) {
        return undefined;
      }
      const bytes = new Uint8Array(result.buffer, 2, length);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      this.logging.log(
        `Error reading DAPLink serial: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  /**
   * Drain stale responses from the USB buffer.
   * Sends DAP_INFO commands and reads until the response matches,
   * discarding any stale responses from interrupted operations.
   *
   * Routed through sendQueue to avoid interleaving with other USB I/O.
   *
   * See: https://github.com/microbit-foundation/python-editor-v3/issues/89
   */
  async drain(): Promise<void> {
    return this.sendQueue.add(async () => {
      const maxAttempts = 10;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const packet = new Uint8Array([DAP_INFO, 0x01]);
        await this.write(packet);

        const response = await this.read();
        const responseBytes = new Uint8Array(response.buffer);

        if (responseBytes[0] === DAP_INFO) {
          for (let i = 0; i < attempt; i++) {
            await this.read();
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

  private async swjSequence(data: Uint8Array | Uint16Array): Promise<void> {
    const bytes =
      data instanceof Uint8Array ? data : new Uint8Array(data.buffer);
    const bitLength = bytes.byteLength * 8;
    const payload = new Uint8Array(bytes.length + 1);
    payload[0] = bitLength;
    payload.set(bytes, 1);
    await this.send(DAP_SWJ_SEQUENCE, payload);
  }

  // ---- DAP transfer operations ----

  /**
   * Execute a sequence of DAP transfer operations.
   * Returns the values read (one per READ operation in the sequence).
   */
  private async transfer(operations: DAPOperation[]): Promise<Uint32Array> {
    // Deduplicate operations that match cached state. We build a filtered
    // list to send but only update the cache after a successful transfer.
    const filtered = operations.filter((op) => {
      if (op.mode !== WRITE) return true;
      if (op.port === DP && op.register === DP_SELECT) {
        return op.value !== this.selectedAddress;
      }
      if (op.port === AP && op.register === AP_CSW) {
        return op.value !== this.cswValue;
      }
      return true;
    });

    if (filtered.length === 0) {
      return new Uint32Array(0);
    }

    const data = new Uint8Array(
      TRANSFER_HEADER_SIZE + filtered.length * TRANSFER_OPERATION_SIZE,
    );
    const view = new DataView(data.buffer);

    view.setUint8(0, 0); // DAP index (ignored for SWD)
    view.setUint8(1, filtered.length);

    filtered.forEach((op, index) => {
      const offset = TRANSFER_HEADER_SIZE + index * TRANSFER_OPERATION_SIZE;
      view.setUint8(offset, op.port | op.mode | op.register);
      view.setUint32(offset + 1, op.value ?? 0, true);
    });

    try {
      const result = await this.send(DAP_TRANSFER, data);

      const completedCount = result.getUint8(1);
      const response = result.getUint8(2);
      if (response !== TRANSFER_OK) {
        // Transfer failed — we don't know which ops the device applied,
        // so invalidate the cache to force re-sends next time.
        this.selectedAddress = undefined;
        this.cswValue = undefined;
        throw new DapTransferError(response, completedCount, filtered.length);
      }
      if (completedCount !== filtered.length) {
        this.selectedAddress = undefined;
        this.cswValue = undefined;
        throw new DapError(
          `Transfer count mismatch: expected ${filtered.length}, got ${completedCount}`,
        );
      }

      // Update cache to reflect what was actually sent to the device.
      for (const op of filtered) {
        if (op.mode !== WRITE) continue;
        if (op.port === DP && op.register === DP_SELECT) {
          this.selectedAddress = op.value;
        } else if (op.port === AP && op.register === AP_CSW) {
          this.cswValue = op.value;
        }
      }

      // The device returns 4 bytes per READ operation only
      const readCount = filtered.filter((op) => op.mode === READ).length;
      return new Uint32Array(result.buffer.slice(3, 3 + readCount * 4));
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      await this.clearAbort();
      throw error;
    }
  }

  /**
   * Read a block of 32-bit values from a single register using DAP_TRANSFER_BLOCK.
   */
  private async transferBlockRead(
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
    view.setUint8(0, 0); // DAP index
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
      if (error instanceof DeviceError) throw error;
      await this.clearAbort();
      throw error;
    }
  }

  /**
   * Write a block of 32-bit values to a single register using DAP_TRANSFER_BLOCK.
   */
  private async transferBlockWrite(
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
    view.setUint8(0, 0); // DAP index
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
      if (error instanceof DeviceError) throw error;
      await this.clearAbort();
      throw error;
    }
  }

  // ---- DP/AP register helpers ----

  private readDPOps(register: number): DAPOperation[] {
    return [{ mode: READ, port: DP, register }];
  }

  private writeDPOps(register: number, value: number): DAPOperation[] {
    return [{ mode: WRITE, port: DP, register, value }];
  }

  private readAPOps(register: number): DAPOperation[] {
    const address = (register & APSEL) | (register & APBANKSEL);
    return [
      ...this.writeDPOps(DP_SELECT, address),
      { mode: READ, port: AP, register },
    ];
  }

  private writeAPOps(register: number, value: number): DAPOperation[] {
    const address = (register & APSEL) | (register & APBANKSEL);
    return [
      ...this.writeDPOps(DP_SELECT, address),
      { mode: WRITE, port: AP, register, value },
    ];
  }

  readMem32Ops(address: number): DAPOperation[] {
    return [
      ...this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
      ...this.writeAPOps(AP_TAR, address),
      ...this.readAPOps(AP_DRW),
    ];
  }

  writeMem32Ops(address: number, value: number): DAPOperation[] {
    return [
      ...this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
      ...this.writeAPOps(AP_TAR, address),
      ...this.writeAPOps(AP_DRW, value),
    ];
  }

  /**
   * Execute a sequence of operation groups as individual transfers.
   * Each group is sent as a separate DAP_TRANSFER to guarantee that
   * all operations within a group execute atomically on the wire.
   * Returns concatenated read results.
   */
  async transferSequence(groups: DAPOperation[][]): Promise<Uint32Array> {
    const results: Uint32Array[] = [];
    for (const group of groups) {
      const result = await this.transfer(group);
      results.push(result);
    }
    return concatUint32Arrays(results);
  }

  // ---- DP/AP/memory operations ----

  private async readDP(register: number): Promise<number> {
    const result = await this.transfer(this.readDPOps(register));
    return result[0];
  }

  async readMem32(address: number): Promise<number> {
    const result = await this.transfer(this.readMem32Ops(address));
    return result[0];
  }

  async writeMem32(address: number, value: number): Promise<void> {
    await this.transfer(this.writeMem32Ops(address, value));
  }

  /**
   * Read a block of 32-bit words from memory.
   * Handles TAR auto-increment page boundaries and block size limits.
   */
  async readBlock(address: number, count: number): Promise<Uint32Array> {
    const results: Uint32Array[] = [];
    let remaining = count;
    let addr = address;

    while (remaining > 0) {
      const nextPageOffset = AUTOINC_PAGESIZE - (addr % AUTOINC_PAGESIZE);
      const chunkWords = Math.min(remaining, nextPageOffset / 4);

      // Set up CSW and TAR for this chunk
      await this.transferSequence([
        this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
        this.writeAPOps(AP_TAR, addr),
      ]);

      // Read in sub-chunks limited by block size
      let subRemaining = chunkWords;
      while (subRemaining > 0) {
        const subChunk = Math.min(subRemaining, Math.floor(this.blockSize / 4));
        const result = await this.transferBlockRead(AP, AP_DRW, subChunk);
        results.push(result);
        subRemaining -= subChunk;
      }

      addr += chunkWords * 4;
      remaining -= chunkWords;
    }

    return concatUint32Arrays(results);
  }

  /**
   * Write a block of 32-bit words to memory.
   * Handles TAR auto-increment page boundaries and block size limits.
   */
  async writeBlock(address: number, values: Uint32Array): Promise<void> {
    let index = 0;
    let addr = address;

    while (index < values.length) {
      const nextPageOffset = AUTOINC_PAGESIZE - (addr % AUTOINC_PAGESIZE);
      const chunkWords = Math.min(values.length - index, nextPageOffset / 4);
      const chunk = values.slice(index, index + chunkWords);

      // Set up CSW and TAR for this chunk
      await this.transferSequence([
        this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
        this.writeAPOps(AP_TAR, addr),
      ]);

      // Write in sub-chunks limited by block size
      let subIndex = 0;
      while (subIndex < chunk.length) {
        const subChunk = chunk.slice(
          subIndex,
          subIndex + Math.floor(this.blockSize / 4),
        );
        await this.transferBlockWrite(AP, AP_DRW, subChunk);
        subIndex += Math.floor(this.blockSize / 4);
      }

      addr += chunkWords * 4;
      index += chunkWords;
    }
  }
}

// ---------------------------------------------------------------------------
// CortexM — ARM Cortex-M processor control
// ---------------------------------------------------------------------------

// Cortex-M core register indices used with readCoreRegister/writeCoreRegister.
export const CoreRegister = { SP: 13, LR: 14, PC: 15, PSR: 16 } as const;

export class CortexM {
  constructor(private dap: CmsisDap) {}

  private enableDebug(): Promise<void> {
    return this.dap.writeMem32(DHCSR, DBGKEY | C_DEBUGEN);
  }

  async isHalted(): Promise<boolean> {
    const dhcsr = await this.dap.readMem32(DHCSR);
    return !!(dhcsr & S_HALT);
  }

  async halt(wait = true, timeout = 0): Promise<void> {
    if (await this.isHalted()) return;
    await this.dap.writeMem32(DHCSR, DBGKEY | C_DEBUGEN | C_HALT);
    if (wait) {
      await waitFor(() => this.isHalted(), timeout);
    }
  }

  async resume(wait = true, timeout = 0): Promise<void> {
    if (!(await this.isHalted())) return;
    await this.dap.writeMem32(DFSR, DFSR_DWTTRAP | DFSR_BKPT | DFSR_HALTED);
    await this.enableDebug();
    if (wait) {
      await waitFor(async () => !(await this.isHalted()), timeout);
    }
  }

  async readCoreRegister(register: number): Promise<number> {
    // Batch: write DCRSR, read DHCSR, read DCRDR in one transfer sequence
    const results = await this.dap.transferSequence([
      this.dap.writeMem32Ops(DCRSR, register),
      this.dap.readMem32Ops(DHCSR),
      this.dap.readMem32Ops(DCRDR),
    ]);
    if (!(results[0] & S_REGRDY)) {
      throw new DapError("Register not ready");
    }
    return results[1];
  }

  async writeCoreRegister(register: number, value: number): Promise<void> {
    // Batch: write DCRDR, write DCRSR, read DHCSR in one transfer sequence
    const results = await this.dap.transferSequence([
      this.dap.writeMem32Ops(DCRDR, value),
      this.dap.writeMem32Ops(DCRSR, register | REGWnR),
      this.dap.readMem32Ops(DHCSR),
    ]);
    if (!(results[0] & S_REGRDY)) {
      throw new DapError("Register not ready");
    }
  }

  /**
   * Wait until the core halts (e.g. on a breakpoint).
   */
  async waitForHalt(timeout = 10_000): Promise<void> {
    await waitFor(() => this.isHalted(), timeout);
  }

  /**
   * Upload code to target RAM, set up registers, resume execution,
   * and wait for the core to halt (typically on a BKPT instruction).
   *
   * @param address RAM address to write the code to.
   * @param code Machine code words to upload.
   * @param sp Stack pointer value.
   * @param pc Program counter value (entry point).
   * @param lr Link register value (typically address + 1 for the BKPT).
   * @param registers Values for general-purpose registers R0, R1, R2, ...
   */
  async execute(
    address: number,
    code: Uint32Array,
    sp: number,
    pc: number,
    lr: number,
    ...registers: number[]
  ): Promise<void> {
    if (registers.length > 12) {
      throw new DapError(
        `Only 12 general purpose registers but got ${registers.length} values`,
      );
    }
    await this.halt(true);
    await this.dap.writeBlock(address, code);
    await this.writeCoreRegister(CoreRegister.PC, pc);
    await this.writeCoreRegister(CoreRegister.LR, lr);
    await this.writeCoreRegister(CoreRegister.SP, sp);
    await this.writeCoreRegister(CoreRegister.PSR, 0x01000000);
    for (let i = 0; i < registers.length; i++) {
      await this.writeCoreRegister(i, registers[i]);
    }
    await this.resume(false);
    await this.waitForHalt();
  }

  /**
   * Software reset by writing to NVIC_AIRCR.
   * Waits for the system to come out of reset.
   */
  async softwareReset(): Promise<void> {
    await this.dap.writeMem32(
      NVIC_AIRCR,
      NVIC_AIRCR_VECTKEY | NVIC_AIRCR_SYSRESETREQ,
    );
    // Wait for the system to come out of reset
    await waitFor(async () => {
      const dhcsr = await this.dap.readMem32(DHCSR);
      return (dhcsr & S_RESET_ST) === 0;
    }, 5000);
  }

  /**
   * Reset the target, optionally halting the core on reset.
   */
  async reset(halt = false): Promise<void> {
    if (halt) {
      await this.halt(true);

      // VC_CORERESET causes the core to halt on reset.
      const demcr = await this.dap.readMem32(DEMCR);
      await this.dap.writeMem32(DEMCR, demcr | DEMCR_VC_CORERESET);

      await this.softwareReset();
      await waitFor(() => this.isHalted());

      // Unset the VC_CORERESET bit
      await this.dap.writeMem32(DEMCR, demcr);
    } else {
      await this.softwareReset();
    }
  }
}

// ---------------------------------------------------------------------------
// DAPLink serial — vendor commands for UART serial access
// ---------------------------------------------------------------------------

export class DapLinkSerial {
  private polling = false;

  constructor(
    private dap: CmsisDap,
    private logging: Logging,
  ) {}

  async getSerialBaudrate(): Promise<number> {
    const result = await this.dap.send(DapLinkVendorCmd.READ_SETTINGS);
    return result.getUint32(1, true);
  }

  async setSerialBaudrate(baudrate: number): Promise<void> {
    await this.dap.send(
      DapLinkVendorCmd.WRITE_SETTINGS,
      new Uint8Array(new Uint32Array([baudrate]).buffer),
    );
  }

  async serialRead(): Promise<string | undefined> {
    const result = await this.dap.send(DapLinkVendorCmd.SERIAL_READ);
    // send() already validates byte 0 matches the command
    const length = result.getUint8(1);
    if (length === 0) return undefined;

    const bytes = new Uint8Array(result.buffer, 2, length);
    return new TextDecoder().decode(bytes);
  }

  async serialWrite(data: string): Promise<void> {
    const encoded = new TextEncoder().encode(data);
    const payload = new Uint8Array(encoded.length + 1);
    payload[0] = encoded.length;
    payload.set(encoded, 1);
    await this.dap.send(DapLinkVendorCmd.SERIAL_WRITE, payload);
  }

  async startSerialRead(
    onData: (data: string) => void,
    serialDelay = 100,
  ): Promise<void> {
    this.polling = true;
    try {
      while (this.polling) {
        const data = await this.serialRead();
        if (data !== undefined && this.polling) {
          onData(data);
        }
        await new Promise((resolve) => setTimeout(resolve, serialDelay));
      }
    } finally {
      this.polling = false;
    }
  }

  stopSerialRead(): void {
    this.polling = false;
  }

  /**
   * Drain any buffered serial data from DAPLink's UART ring buffer.
   * Reads and discards until empty.
   */
  async drain(): Promise<void> {
    let totalDrained = 0;
    while (true) {
      const data = await this.serialRead();
      if (!data) break;
      totalDrained += data.length;
    }
    if (totalDrained > 0) {
      this.logging.log(`Drained ${totalDrained} bytes of stale serial data`);
    }
  }
}

// ---------------------------------------------------------------------------
// DAPLink flash — vendor commands for flash streaming
// ---------------------------------------------------------------------------

export async function dapLinkFlash(
  dap: CmsisDap,
  buffer: Uint8Array,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const arrayBuffer = buffer.buffer;

  // Stream type 1 = Intel HEX (the only format we use).
  // DAPLink vendor commands return an error_t status in byte 1:
  //   0 = ERROR_SUCCESS, 18 = ERROR_SUCCESS_DONE, 19 = ERROR_SUCCESS_DONE_OR_CONTINUE

  const openResult = await dap.send(
    DapLinkVendorCmd.FLASH_OPEN,
    new Uint8Array(new Uint32Array([1]).buffer),
  );
  if (openResult.getUint8(1) !== DAPLINK_ERROR_SUCCESS) {
    throw new DapError(`Flash open error (status=${openResult.getUint8(1)})`);
  }

  try {
    // We intentionally don't check FLASH_WRITE status for errors. V1
    // micro:bit DAPLink reports ERROR_ERASE_SECTOR (16) late in the
    // flash but the write still succeeds. dapjs never checked these.
    let offset = 0;
    while (offset < arrayBuffer.byteLength) {
      const end = Math.min(
        arrayBuffer.byteLength,
        offset + DAPLINK_FLASH_PAGE_SIZE,
      );
      const page = arrayBuffer.slice(offset, end);
      const data = new Uint8Array(page.byteLength + 1);
      data[0] = page.byteLength;
      data.set(new Uint8Array(page), 1);

      const writeResult = await dap.send(DapLinkVendorCmd.FLASH_WRITE, data);
      onProgress?.(offset / arrayBuffer.byteLength);
      offset = end;
      // DAPLink signals hex EOF with ERROR_SUCCESS_DONE (18).
      if (writeResult.getUint8(1) === DAPLINK_ERROR_SUCCESS_DONE) break;
    }

    onProgress?.(1.0);

    const closeResult = await dap.send(DapLinkVendorCmd.FLASH_CLOSE);
    if (closeResult.getUint8(1) !== DAPLINK_ERROR_SUCCESS) {
      throw new DapError(
        `Flash close error (status=${closeResult.getUint8(1)})`,
      );
    }

    // Reset the target if DAPLink's auto_rst is disabled. With the default
    // config this is a no-op (FLASH_CLOSE already resets), but ensures the
    // target runs the new program regardless of DAPLink settings.
    await dap.send(DapLinkVendorCmd.FLASH_RESET);
  } catch (error) {
    // Close the flash stream so DAPLink exits flash mode.
    // Without this, subsequent DAP commands fail because DAPLink
    // is still waiting for flash data.
    try {
      await dap.send(DapLinkVendorCmd.FLASH_CLOSE);
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    // Flash operations (successful reset or failed close) leave
    // the DAP protocol state stale — always invalidate.
    dap.invalidate();
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

function concatUint32Arrays(arrays: Uint32Array[]): Uint32Array {
  if (arrays.length === 1) return arrays[0];
  let length = 0;
  for (const a of arrays) length += a.length;
  const result = new Uint32Array(length);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
