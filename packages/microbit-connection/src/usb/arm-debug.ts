/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * Derived from dapjs (https://github.com/ARMmbed/dapjs) which is
 * Copyright (c) Arm Limited 2018
 * Copyright (c) Microsoft Corporation
 *
 * SPDX-License-Identifier: MIT
 *
 * ARM Debug Interface (ADI) layer for SWD access to a Cortex-M target,
 * derived from dapjs (https://github.com/ARMmbed/dapjs). This file and
 * its siblings (transport.ts, cmsis-dap.ts, cortex-m.ts, daplink.ts)
 * are a minimal reimplementation covering only the features needed for
 * micro:bit.
 *
 * ArmDebugSwd manages the SWD connection lifecycle and provides
 * register-level access to the Debug Port (DP) and Access Port (AP).
 * It sits between CmsisDapUsb (command framing) and higher-level consumers
 * like CortexM (processor control) and DAPLink (flash/serial).
 *
 * Key responsibilities:
 * - SWD initialisation sequence (JTAG-to-SWD switch, power-up, ID read)
 * - Automatic drain-and-retry on stale USB responses after page reload
 * - DP_SELECT and AP_CSW register caching to reduce redundant writes
 * - Memory read/write via AP_TAR + AP_DRW, handling page boundaries
 *   and block-transfer size limits
 *
 * Protocol references:
 * - ARM ADI: https://developer.arm.com/documentation/ihi0031/a/
 * - DAPLink: https://github.com/ARMmbed/DAPLink
 *
 * The dapjs license is included below:
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
 */

import { DeviceError } from "../device.js";
import { Logging } from "../logging.js";
import {
  ABORT_ALL,
  AP,
  type CmsisDap,
  DapOperation,
  DapResponseMismatchError,
  DP,
  READ,
  WRITE,
} from "./cmsis-dap.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// CTRL/STAT register bits
const CSYSPWRUPREQ = 1 << 30;
const CDBGPWRUPREQ = 1 << 28;
const CSYSPWRUPACK = 1 << 31;
const CDBGPWRUPACK = 1 << 29;

// TAR auto-increment page size (1KB, implementation-defined minimum)
const AUTOINC_PAGESIZE = 1 << 10;

// Clock frequency (10 MHz)
const CLOCK_FREQUENCY = 10_000_000;

// Wait delay for polling loops
const WAIT_DELAY = 100;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export async function waitFor(
  fn: () => Promise<boolean>,
  timeout = 10_000,
  delay = WAIT_DELAY,
): Promise<void> {
  const deadline = timeout > 0 ? Date.now() + timeout : 0;
  while (true) {
    if (await fn()) return;
    if (deadline && Date.now() > deadline) {
      throw new DeviceError({
        code: "timeout",
        message: "Wait timed out",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
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

// ---------------------------------------------------------------------------
// ArmDebug interface / ArmDebugSwd implementation
// ---------------------------------------------------------------------------

export interface ArmDebug {
  readonly dap: CmsisDap;
  readonly isOpen: boolean;

  /** Read a 32-bit word from a memory-mapped address. */
  readMem32(address: number): Promise<number>;

  /** Write a 32-bit word to a memory-mapped address. */
  writeMem32(address: number, value: number): Promise<void>;

  /** Build DAP operations for reading a 32-bit word (for use with transferSequence). */
  readMem32Ops(address: number): DapOperation[];

  /** Build DAP operations for writing a 32-bit word (for use with transferSequence). */
  writeMem32Ops(address: number, value: number): DapOperation[];

  /**
   * Read a block of 32-bit words from memory.
   * Handles TAR auto-increment page boundaries and block size limits.
   */
  readBlock(address: number, count: number): Promise<Uint32Array>;

  /**
   * Write a block of 32-bit words to memory.
   * Handles TAR auto-increment page boundaries and block size limits.
   */
  writeBlock(address: number, values: Uint32Array): Promise<void>;

  /**
   * Execute a sequence of operation groups as individual transfers.
   * Each group is sent as a separate DAP_TRANSFER to guarantee that
   * all operations within a group execute atomically on the wire.
   */
  transferSequence(groups: DapOperation[][]): Promise<Uint32Array>;

  /**
   * Reset cached protocol state without closing the transport.
   * Call after operations that reset the target (e.g. DAPLink flash reset).
   */
  resetState(): void;

  /**
   * Connect to the target with automatic drain-and-retry on stale responses.
   */
  connect(maxRetries?: number): Promise<void>;

  disconnect(): Promise<void>;

  /**
   * Reset cached state and reconnect without closing the transport.
   * Use after operations like DAPLink flash that leave the protocol state
   * stale but don't require full re-enumeration.
   */
  reinit(): Promise<void>;
}

export class ArmDebugSwd implements ArmDebug {
  private swdConnected = false;

  // ADI state (register caching)
  private selectedAddress?: number;
  private cswValue?: number;

  constructor(
    readonly dap: CmsisDap,
    private logging: Logging,
  ) {}

  get isOpen(): boolean {
    return this.dap.isOpen;
  }

  // ---- SWD lifecycle ----

  /**
   * Initialize SWD: connect to the target, set up the debug port,
   * and power up the debug and system domains.
   */
  private async connectOnce(): Promise<void> {
    if (this.swdConnected) return;

    await this.dap.open();

    // SWD protocol setup. On failure the transport is left open so the
    // caller can drain stale responses and retry without re-opening.
    try {
      await this.dap.swjClock(CLOCK_FREQUENCY);
      await this.dap.connect();
    } catch (error) {
      try {
        await this.dap.clearAbort();
      } catch {
        /* ignore */
      }
      throw error;
    }

    await this.dap.configureTransfer(0, 100, 0);

    // Select SWD protocol
    await this.dap.swjSequence(
      new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );
    await this.dap.swjSequence(new Uint8Array([0x9e, 0xe7]));
    await this.dap.swjSequence(
      new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );
    await this.dap.swjSequence(new Uint8Array([0x00]));

    this.swdConnected = true;

    // Initialize debug port and power up
    try {
      await this.readDP(DP_DPIDR);

      await this.transferSequence([
        this.writeDPOps(DP_ABORT, ABORT_ALL),
        this.writeDPOps(DP_SELECT, AP_CSW),
        this.writeDPOps(DP_CTRL_STAT, CSYSPWRUPREQ | CDBGPWRUPREQ),
      ]);

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

  async connect(maxRetries = 3): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logging.log(
            `Connection retry attempt ${attempt + 1}/${maxRetries}`,
          );
          await this.dap.drainStaleResponses();
        }
        await this.connectOnce();
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

  resetState(): void {
    this.swdConnected = false;
    this.selectedAddress = undefined;
    this.cswValue = undefined;
  }

  async disconnect(): Promise<void> {
    if (!this.swdConnected) return;
    try {
      await this.dap.disconnect();
    } catch {
      this.logging.log("Disconnect failed, clearing abort");
      try {
        await this.dap.clearAbort();
      } catch {
        /* ignore */
      }
    }
    await this.dap.close();
    this.resetState();
    this.logging.log("SWD disconnected");
  }

  async reinit(): Promise<void> {
    this.logging.log("Reinitialising SWD");
    this.resetState();
    await this.connectOnce();
  }

  // ---- DP/AP register helpers ----

  private readDPOps(register: number): DapOperation[] {
    return [{ mode: READ, port: DP, register }];
  }

  private writeDPOps(register: number, value: number): DapOperation[] {
    return [{ mode: WRITE, port: DP, register, value }];
  }

  private readAPOps(register: number): DapOperation[] {
    const address = (register & APSEL) | (register & APBANKSEL);
    return [
      ...this.writeDPOps(DP_SELECT, address),
      { mode: READ, port: AP, register },
    ];
  }

  private writeAPOps(register: number, value: number): DapOperation[] {
    const address = (register & APSEL) | (register & APBANKSEL);
    return [
      ...this.writeDPOps(DP_SELECT, address),
      { mode: WRITE, port: AP, register, value },
    ];
  }

  readMem32Ops(address: number): DapOperation[] {
    return [
      ...this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
      ...this.writeAPOps(AP_TAR, address),
      ...this.readAPOps(AP_DRW),
    ];
  }

  writeMem32Ops(address: number, value: number): DapOperation[] {
    return [
      ...this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
      ...this.writeAPOps(AP_TAR, address),
      ...this.writeAPOps(AP_DRW, value),
    ];
  }

  // ---- Transfer with register caching ----

  /**
   * Execute a batch of DAP transfer operations, deduplicating writes
   * to DP_SELECT and AP_CSW that match cached state.
   */
  private async transfer(operations: DapOperation[]): Promise<Uint32Array> {
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

    try {
      const result = await this.dap.transfer(filtered);

      // Update cache on success
      for (const op of filtered) {
        if (op.mode !== WRITE) continue;
        if (op.port === DP && op.register === DP_SELECT) {
          this.selectedAddress = op.value;
        } else if (op.port === AP && op.register === AP_CSW) {
          this.cswValue = op.value;
        }
      }

      return result;
    } catch (error) {
      // Transfer failed — invalidate the cache
      this.selectedAddress = undefined;
      this.cswValue = undefined;
      throw error;
    }
  }

  async transferSequence(groups: DapOperation[][]): Promise<Uint32Array> {
    const results: Uint32Array[] = [];
    for (const group of groups) {
      const result = await this.transfer(group);
      results.push(result);
    }
    return concatUint32Arrays(results);
  }

  // ---- Memory operations ----

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

  async readBlock(address: number, count: number): Promise<Uint32Array> {
    const results: Uint32Array[] = [];
    let remaining = count;
    let addr = address;

    while (remaining > 0) {
      const nextPageOffset = AUTOINC_PAGESIZE - (addr % AUTOINC_PAGESIZE);
      const chunkWords = Math.min(remaining, nextPageOffset / 4);

      await this.transferSequence([
        this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
        this.writeAPOps(AP_TAR, addr),
      ]);

      let subRemaining = chunkWords;
      while (subRemaining > 0) {
        const subChunk = Math.min(
          subRemaining,
          Math.floor(this.dap.blockSize / 4),
        );
        const result = await this.dap.transferBlockRead(AP, AP_DRW, subChunk);
        results.push(result);
        subRemaining -= subChunk;
      }

      addr += chunkWords * 4;
      remaining -= chunkWords;
    }

    return concatUint32Arrays(results);
  }

  async writeBlock(address: number, values: Uint32Array): Promise<void> {
    let index = 0;
    let addr = address;

    while (index < values.length) {
      const nextPageOffset = AUTOINC_PAGESIZE - (addr % AUTOINC_PAGESIZE);
      const chunkWords = Math.min(values.length - index, nextPageOffset / 4);
      const chunk = values.slice(index, index + chunkWords);

      await this.transferSequence([
        this.writeAPOps(AP_CSW, CSW_VALUE | CSW_SIZE32),
        this.writeAPOps(AP_TAR, addr),
      ]);

      let subIndex = 0;
      while (subIndex < chunk.length) {
        const subChunk = chunk.slice(
          subIndex,
          subIndex + Math.floor(this.dap.blockSize / 4),
        );
        await this.dap.transferBlockWrite(AP, AP_DRW, subChunk);
        subIndex += Math.floor(this.dap.blockSize / 4);
      }

      addr += chunkWords * 4;
      index += chunkWords;
    }
  }
}
