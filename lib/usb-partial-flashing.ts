/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * This file is made up of a combination of original code, along with code
 * extracted from the following repositories:
 *
 * https://github.com/mmoskal/dapjs/tree/a32f11f54e9e76a9c61896ddd425c1cb1a29c143
 * https://github.com/microsoft/pxt-microbit
 *
 * The pxt-microbit license is included below.
 *
 * PXT - Programming Experience Toolkit
 *
 * The MIT License (MIT)
 *
 * Copyright (c) Microsoft Corporation
 *
 * All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Implementation of partial flashing for the micro:bit.
 *
 * Latest Microsoft implementation is here:
 * https://github.com/microsoft/pxt-microbit/blob/master/editor/flash.ts
 */

// dapjs import faff needed for Vitest https://github.com/ARMmbed/dapjs/issues/118
import * as dapjs from "dapjs";
const { DAPLink: DAPLinkValue } = dapjs;
import { Logging } from "./logging.js";
import { withTimeout, TimeoutError } from "./async-util.js";
import { DAPWrapper } from "./usb-device-wrapper.js";
import {
  CoreRegister,
  onlyChanged,
  Page,
  pageAlignBlocks,
  read32FromUInt8Array,
} from "./usb-partial-flashing-utils.js";
import { BoardVersion } from "./device.js";
import MemoryMap from "nrf-intel-hex";

type ProgressCallback = (n: number, partial: boolean) => void;

// Source code for binaries in can be found at https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/external/sha/source/main.c
// Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L243
// Update from https://github.com/microsoft/pxt-microbit/commit/a35057717222b8e48335144f497b55e29e9b0f25
// prettier-ignore
const flashPageBIN = new Uint32Array([
  0xbe00be00, // bkpt - LR is set to this
  0x2502b5f0, 0x4c204b1f, 0xf3bf511d, 0xf3bf8f6f, 0x25808f4f, 0x002e00ed,
  0x2f00595f, 0x25a1d0fc, 0x515800ed, 0x2d00599d, 0x2500d0fc, 0xf3bf511d,
  0xf3bf8f6f, 0x25808f4f, 0x002e00ed, 0x2f00595f, 0x2501d0fc, 0xf3bf511d,
  0xf3bf8f6f, 0x599d8f4f, 0xd0fc2d00, 0x25002680, 0x00f60092, 0xd1094295,
  0x511a2200, 0x8f6ff3bf, 0x8f4ff3bf, 0x2a00599a, 0xbdf0d0fc, 0x5147594f,
  0x2f00599f, 0x3504d0fc, 0x46c0e7ec, 0x4001e000, 0x00000504,
]);

// void computeHashes(uint32_t *dst, uint8_t *ptr, uint32_t pageSize, uint32_t numPages)
// Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L253
// prettier-ignore
const computeChecksums2 = new Uint32Array([
  0x4c27b5f0, 0x44a52680, 0x22009201, 0x91004f25, 0x00769303, 0x24080013,
  0x25010019, 0x40eb4029, 0xd0002900, 0x3c01407b, 0xd1f52c00, 0x468c0091,
  0xa9044665, 0x506b3201, 0xd1eb42b2, 0x089b9b01, 0x23139302, 0x9b03469c,
  0xd104429c, 0x2000be2a, 0x449d4b15, 0x9f00bdf0, 0x4d149e02, 0x49154a14,
  0x3e01cf08, 0x2111434b, 0x491341cb, 0x405a434b, 0x4663405d, 0x230541da,
  0x4b10435a, 0x466318d2, 0x230541dd, 0x4b0d435d, 0x2e0018ed, 0x6002d1e7,
  0x9a009b01, 0x18d36045, 0x93003008, 0xe7d23401, 0xfffffbec, 0xedb88320,
  0x00000414, 0x1ec3a6c8, 0x2f9be6cc, 0xcc9e2d51, 0x1b873593, 0xe6546b64,
]);

const membase = 0x20000000;
const loadAddr = membase;
const dataAddr = 0x20002000;
const stackAddr = 0x20001000;

/**
 * Uses a DAPWrapper to flash the micro:bit.
 *
 * Intented to be used for a single flash with a pre-connected DAPWrapper.
 */
export class PartialFlashing {
  constructor(
    private dapwrapper: DAPWrapper,
    private logging: Logging,
    private boardVersion: BoardVersion,
  ) {}

  private log(v: any): void {
    this.logging.log(v);
  }

  // Runs the checksum algorithm on the micro:bit's whole flash memory, and returns the results.
  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L365
  private async getFlashChecksumsAsync() {
    await this.dapwrapper.executeAsync(
      loadAddr,
      computeChecksums2,
      stackAddr,
      loadAddr + 1,
      0xffffffff,
      dataAddr,
      0,
      this.dapwrapper.pageSize,
      this.dapwrapper.numPages,
    );
    return this.dapwrapper.readBlockAsync(
      dataAddr,
      this.dapwrapper.numPages * 2,
    );
  }

  // Runs the code on the micro:bit to copy a single page of data from RAM address addr to the ROM address specified by the page.
  // Does not wait for execution to halt.
  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L340
  private async runFlash(page: Page, addr: number): Promise<void> {
    await this.dapwrapper.cortexM.halt(true);
    await Promise.all([
      this.dapwrapper.cortexM.writeCoreRegister(
        CoreRegister.PC,
        loadAddr + 4 + 1,
      ),
      this.dapwrapper.cortexM.writeCoreRegister(CoreRegister.LR, loadAddr + 1),
      this.dapwrapper.cortexM.writeCoreRegister(CoreRegister.SP, stackAddr),
      this.dapwrapper.cortexM.writeCoreRegister(0, page.targetAddr),
      this.dapwrapper.cortexM.writeCoreRegister(1, addr),
      this.dapwrapper.cortexM.writeCoreRegister(
        2,
        this.dapwrapper.pageSize >> 2,
      ),
    ]);
    return this.dapwrapper.cortexM.resume(false);
  }

  // Write a single page of data to micro:bit ROM by writing it to micro:bit RAM and copying to ROM.
  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L385
  private async partialFlashPageAsync(
    page: Page,
    nextPage: Page,
    i: number,
  ): Promise<void> {
    // TODO: This short-circuits UICR, do we need to update this?
    if (page.targetAddr >= 0x10000000) {
      return;
    }

    // Use two slots in RAM to allow parallelisation of the following two tasks.
    // 1. DAPjs writes a page to one slot.
    // 2. flashPageBIN copies a page to flash from the other slot.
    let thisAddr = i & 1 ? dataAddr : dataAddr + this.dapwrapper.pageSize;
    let nextAddr = i & 1 ? dataAddr + this.dapwrapper.pageSize : dataAddr;

    // Write first page to slot in RAM.
    // All subsequent pages will have already been written to RAM.
    if (i === 0) {
      let u32data = new Uint32Array(page.data.length / 4);
      for (let j = 0; j < page.data.length; j += 4) {
        u32data[j >> 2] = read32FromUInt8Array(page.data, j);
      }
      await this.dapwrapper.writeBlockAsync(thisAddr, u32data);
    }

    await this.runFlash(page, thisAddr);
    // Write next page to micro:bit RAM if it exists.
    if (nextPage) {
      let buf = new Uint32Array(nextPage.data.buffer);
      await this.dapwrapper.writeBlockAsync(nextAddr, buf);
    }
    return this.dapwrapper.waitForHalt();
  }

  // Write pages of data to micro:bit ROM.
  private async partialFlashCoreAsync(
    pages: Page[],
    updateProgress: ProgressCallback,
  ) {
    this.log("Partial flash");
    for (let i = 0; i < pages.length; ++i) {
      updateProgress(i / pages.length, true);
      await this.partialFlashPageAsync(pages[i], pages[i + 1], i);
    }
    updateProgress(1, true);
  }

  // Flash the micro:bit's ROM with the provided image by only copying over the pages that differ.
  // Falls back to a full flash if partial flashing fails.
  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L335
  private async partialFlashAsync(
    data: string | Uint8Array | MemoryMap,
    updateProgress: ProgressCallback,
  ): Promise<boolean> {
    const flashBytes = this.convertDataToPaddedBytes(data);

    const checksums = await this.getFlashChecksumsAsync();
    await this.dapwrapper.writeBlockAsync(loadAddr, flashPageBIN);
    let aligned = pageAlignBlocks(flashBytes, 0, this.dapwrapper.pageSize);
    const totalPages = aligned.length;
    this.log("Total pages: " + totalPages);
    aligned = onlyChanged(aligned, checksums, this.dapwrapper.pageSize);
    this.log("Changed pages: " + aligned.length);
    let partial: boolean | undefined;
    if (aligned.length > totalPages / 2) {
      try {
        await this.fullFlashAsync(data, updateProgress);
        partial = false;
      } catch (e) {
        this.log(e);
        this.log("Full flash failed, attempting partial flash.");
        await this.partialFlashCoreAsync(aligned, updateProgress);
        partial = true;
      }
    } else {
      try {
        await this.partialFlashCoreAsync(aligned, updateProgress);
        partial = true;
      } catch (e) {
        this.log(e);
        this.log("Partial flash failed, attempting full flash.");
        await this.fullFlashAsync(data, updateProgress);
        partial = false;
      }
    }

    try {
      await this.dapwrapper.reset();
    } catch (e) {
      // Allow errors on resetting, user can always manually reset if necessary.
    }
    this.log("Flashing complete");
    return partial;
  }

  // Perform full flash of micro:bit's ROM using daplink.
  async fullFlashAsync(
    data: string | Uint8Array | MemoryMap,
    updateProgress: ProgressCallback,
  ) {
    this.log("Full flash");

    const fullFlashProgress = (progress: number) => {
      updateProgress(progress, false);
    };
    this.dapwrapper.daplink.on(DAPLinkValue.EVENT_PROGRESS, fullFlashProgress);
    try {
      data = this.convertDataToHexString(data);
      await this.dapwrapper.transport.open();
      await this.dapwrapper.daplink.flash(new TextEncoder().encode(data));
      this.logging.event({
        type: "WebUSB-info",
        message: "full-flash-successful",
      });
    } finally {
      this.dapwrapper.daplink.removeListener(
        DAPLinkValue.EVENT_PROGRESS,
        fullFlashProgress,
      );
    }
  }

  // Flash the micro:bit's ROM with the provided image, resetting the micro:bit first.
  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L439
  async flashAsync(
    data: string | Uint8Array | MemoryMap,
    updateProgress: ProgressCallback,
  ): Promise<boolean> {
    let resetPromise = (async () => {
      // Reset micro:bit to ensure interface responds correctly.
      this.log("Begin reset");
      try {
        await this.dapwrapper.reset(true);
      } catch (e) {
        this.log("Retrying reset");
        await this.dapwrapper.reconnectAsync();
        await this.dapwrapper.reset(true);
      }
    })();

    try {
      try {
        await withTimeout(resetPromise, 1000);

        this.log("Begin flashing");
        return await this.partialFlashAsync(data, updateProgress);
      } catch (e) {
        if (e instanceof TimeoutError) {
          this.log("Resetting micro:bit timed out");
          this.log("Partial flashing failed. Attempting full flash");
          this.logging.event({
            type: "WebUSB-info",
            message: "flash-failed/attempting-full-flash",
          });
          await this.fullFlashAsync(data, updateProgress);
          return false;
        } else {
          throw e;
        }
      }
    } finally {
      // NB cannot return Promises above!
      await this.dapwrapper.disconnectAsync();
    }
  }

  private convertDataToHexString(
    data: string | Uint8Array | MemoryMap,
  ): string {
    if (typeof data === "string") {
      return data;
    }
    if (data instanceof Uint8Array) {
      return this.paddedBytesToHexString(data);
    }
    return data.asHexString();
  }

  private convertDataToPaddedBytes(
    data: string | Uint8Array | MemoryMap,
  ): Uint8Array {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (typeof data === "string") {
      return this.hexStringToPaddedBytes(data);
    }
    return this.memoryMapToPaddedBytes(data);
  }

  private hexStringToPaddedBytes(hex: string): Uint8Array {
    const m = MemoryMap.fromHex(hex);
    return this.memoryMapToPaddedBytes(m);
  }

  private paddedBytesToHexString(data: Uint8Array): string {
    return MemoryMap.fromPaddedUint8Array(data).asHexString();
  }

  private memoryMapToPaddedBytes(memoryMap: MemoryMap): Uint8Array {
    const flashSize = {
      V1: 256 * 1024,
      V2: 512 * 1024,
    }[this.boardVersion];
    return memoryMap.slicePad(0, flashSize);
  }
}
