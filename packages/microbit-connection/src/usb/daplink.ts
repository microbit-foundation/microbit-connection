/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * Derived from dapjs (https://github.com/ARMmbed/dapjs) which is
 * Copyright (c) Arm Limited 2018
 * Copyright (c) Microsoft Corporation
 *
 * SPDX-License-Identifier: MIT
 *
 * See arm-debug.ts for the full dapjs license.
 *
 * DAPLink serial and flash access via CMSIS-DAP vendor commands.
 *
 * DAPLink is the interface firmware running on the micro:bit's debug chip
 * (KL27). It extends the standard CMSIS-DAP protocol with vendor-specific
 * commands (0x80+) for:
 *
 * - UART serial pass-through (DapLinkSerial): reading/writing serial data
 *   to the target micro:bit's UART, with configurable baud rate and
 *   polling-based read loop.
 *
 * - Hex-file flash streaming (dapLinkFlash): streaming Intel HEX data to
 *   DAPLink which handles erasing, programming, and verifying flash pages.
 *   This is the "full flash" path — as opposed to partial flashing which
 *   writes individual pages via SWD.
 */

import { DapLinkVendorCmd } from "../constants.js";
import { Logging } from "../logging.js";
import { ArmDebugInterface } from "./arm-debug.js";
import { CmsisDap, DapError, DapTransferError } from "./cmsis-dap.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// DAPLink stream error codes (error_t in DAPLink's error.h).
// stream_write returns these to indicate success variants.
const DAPLINK_ERROR_SUCCESS = 0;
const DAPLINK_ERROR_SUCCESS_DONE = 18;

// Default flash page size for DAPLink write chunks
const DAPLINK_FLASH_PAGE_SIZE = 62;

// ---------------------------------------------------------------------------
// DapLinkSerial — vendor commands for UART serial access
// ---------------------------------------------------------------------------

export class DapLinkSerial {
  private polling = false;

  constructor(
    private dap: CmsisDap,
    private logging: Logging,
  ) {}

  async getBaudrate(): Promise<number> {
    const result = await this.dap.send(DapLinkVendorCmd.READ_SETTINGS);
    return result.getUint32(1, true);
  }

  async setBaudrate(baudrate: number): Promise<void> {
    await this.dap.send(
      DapLinkVendorCmd.WRITE_SETTINGS,
      new Uint8Array(new Uint32Array([baudrate]).buffer),
    );
  }

  async read(): Promise<string | undefined> {
    const result = await this.dap.send(DapLinkVendorCmd.SERIAL_READ);
    const length = result.getUint8(1);
    if (length === 0) return undefined;

    const bytes = new Uint8Array(result.buffer, 2, length);
    return new TextDecoder().decode(bytes);
  }

  async write(data: string): Promise<void> {
    const encoded = new TextEncoder().encode(data);
    const payload = new Uint8Array(encoded.length + 1);
    payload[0] = encoded.length;
    payload.set(encoded, 1);
    await this.dap.send(DapLinkVendorCmd.SERIAL_WRITE, payload);
  }

  async startPolling(
    onData: (data: string) => void,
    serialDelay = 100,
  ): Promise<void> {
    this.polling = true;
    try {
      while (this.polling) {
        const data = await this.read();
        if (data !== undefined && this.polling) {
          onData(data);
        }
        await new Promise((resolve) => setTimeout(resolve, serialDelay));
      }
    } finally {
      this.polling = false;
    }
  }

  stopPolling(): void {
    this.polling = false;
  }

  /**
   * Drain any buffered serial data from DAPLink's UART ring buffer.
   * Reads and discards until empty.
   */
  async drain(): Promise<void> {
    let totalDrained = 0;
    while (true) {
      const data = await this.read();
      if (!data) break;
      totalDrained += data.length;
    }
    if (totalDrained > 0) {
      this.logging.log(`Drained ${totalDrained} bytes of stale serial data`);
    }
  }
}

// ---------------------------------------------------------------------------
// dapLinkFlash — vendor commands for flash streaming
// ---------------------------------------------------------------------------

export async function dapLinkFlash(
  adi: ArmDebugInterface,
  buffer: Uint8Array,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const { dap } = adi;
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

    await dap.send(DapLinkVendorCmd.FLASH_RESET);
  } catch (error) {
    try {
      await dap.send(DapLinkVendorCmd.FLASH_CLOSE);
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    adi.resetState();
  }
}

// ---------------------------------------------------------------------------
// DAPLink utilities
// ---------------------------------------------------------------------------

/**
 * Read the DAPLink unique ID via vendor command 0x80. Returns the same
 * 48-char hex string as the USB serial number but isn't affected by
 * browser anti-fingerprinting.
 */
export async function readDaplinkUniqueId(
  dap: CmsisDap,
  logging: Logging,
): Promise<string | undefined> {
  try {
    const result = await dap.send(DapLinkVendorCmd.READ_UNIQUE_ID);
    const length = result.getUint8(1);
    if (length === 0) {
      return undefined;
    }
    const bytes = new Uint8Array(result.buffer, 2, length);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    logging.log(
      `Error reading DAPLink unique ID: ${e instanceof Error ? e.message : e}`,
    );
    return undefined;
  }
}

/**
 * Read a 32-bit word from memory, retrying on transfer errors.
 * Useful for reads immediately after reset when the target may not
 * be ready to respond.
 */
export async function readMem32WithRetry(
  adi: ArmDebugInterface,
  address: number,
  logging: Logging,
  maxRetries = 20,
  delayMs = 20,
): Promise<number> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const value = await adi.readMem32(address);
      if (attempt > 0) {
        logging.log(
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
