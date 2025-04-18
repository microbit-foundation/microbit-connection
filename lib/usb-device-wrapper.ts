/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as dapjs from "dapjs";
// dapjs import faff needed for use from Node such as Vitest https://github.com/ARMmbed/dapjs/issues/118
import type { CortexM, DAPLink, WebUSB } from "dapjs";
const {
  CortexM: CortexMValue,
  DAPLink: DAPLinkValue,
  WebUSB: WebUSBValue,
} = dapjs;
import { Logging } from "./logging.js";
import {
  ApReg,
  CortexSpecialReg,
  Csw,
  DapCmd,
  DapVal,
  FICR,
} from "./constants.js";
import {
  apReg,
  bufferConcat,
  CoreRegister,
  regRequest,
} from "./usb-partial-flashing-utils.js";
import { BoardSerialInfo } from "./board-serial-info.js";

export class DAPWrapper {
  transport: WebUSB;
  daplink: DAPLink;
  cortexM: CortexM;

  _pageSize: number | undefined;
  _numPages: number | undefined;
  _deviceId: number | undefined;

  private loggedBoardSerialInfo: BoardSerialInfo | undefined;

  private initialConnectionComplete: boolean = false;

  constructor(
    public device: USBDevice,
    private logging: Logging,
  ) {
    this.transport = new WebUSBValue(this.device);
    this.daplink = new DAPLinkValue(this.transport);
    this.cortexM = new CortexMValue(this.transport);
  }

  /**
   * The page size. Throws if we've not connected.
   */
  get pageSize(): number {
    if (this._pageSize === undefined) {
      throw new Error("pageSize not defined until connected");
    }
    return this._pageSize;
  }

  /**
   * The number of pages. Throws if we've not connected.
   */
  get numPages() {
    if (this._numPages === undefined) {
      throw new Error("numPages not defined until connected");
    }
    return this._numPages;
  }

  /**
   * The number of pages. Undefined if we've not connected.
   */
  get deviceId() {
    return this._deviceId;
  }

  get boardSerialInfo(): BoardSerialInfo {
    return BoardSerialInfo.parse(
      this.device,
      this.logging.log.bind(this.logging),
    );
  }

  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L119
  async reconnectAsync(): Promise<void> {
    if (this.initialConnectionComplete) {
      await this.disconnectAsync();

      this.transport = new WebUSBValue(this.device);
      this.daplink = new DAPLinkValue(this.transport);
      this.cortexM = new CortexMValue(this.transport);
    } else {
      this.initialConnectionComplete = true;
    }

    await this.daplink.connect();
    await this.cortexM.connect();

    this.logging.event({
      type: "WebUSB-info",
      message: "connected",
    });

    const serialInfo = this.boardSerialInfo;
    this.logging.log(`Detected board ID ${serialInfo.id}`);

    if (
      !this.loggedBoardSerialInfo ||
      !this.loggedBoardSerialInfo.eq(this.boardSerialInfo)
    ) {
      this.loggedBoardSerialInfo = this.boardSerialInfo;
      this.logging.event({
        type: "WebUSB-info",
        message: "board-id/" + this.boardSerialInfo.id,
      });
      this.logging.event({
        type: "WebUSB-info",
        message:
          "board-family-hic/" +
          this.boardSerialInfo.familyId +
          this.boardSerialInfo.hic,
      });
    }

    // https://support.microbit.org/support/solutions/articles/19000067679-how-to-find-the-name-of-your-micro-bit
    // We wait on errors as immediately after flash the micro:bit won't be ready to respond
    this._deviceId = await this.readMem32WaitOnError(FICR.DEVICE_ID_1);

    this._pageSize = await this.readMem32WaitOnError(FICR.CODEPAGESIZE);
    this._numPages = await this.readMem32WaitOnError(FICR.CODESIZE);
  }

  async readMem32WaitOnError(register: number): Promise<number> {
    let retries = 0;
    let lastError: Error | undefined;
    while (retries < 20) {
      try {
        return await this.cortexM.readMem32(register);
      } catch (e) {
        if (e instanceof Error) {
          lastError = e;
          if (/^Transfer/.test(e.message)) {
            retries++;
            await new Promise((resolve) => setTimeout(resolve, 20));
          } else {
            throw e;
          }
        }
      }
    }
    throw lastError;
  }

  async startSerial(listener: (data: string) => void): Promise<void> {
    const currentBaud = await this.daplink.getSerialBaudrate();
    if (currentBaud !== 115200) {
      // Changing the baud rate causes a micro:bit reset, so only do it if necessary
      await this.daplink.setSerialBaudrate(115200);
    }
    this.daplink.addListener(DAPLinkValue.EVENT_SERIAL_DATA, listener);
    await this.daplink.startSerialRead(1);
  }

  stopSerial(listener: (data: string) => void): void {
    this.daplink.stopSerialRead();
    this.daplink.removeListener(DAPLinkValue.EVENT_SERIAL_DATA, listener);
  }

  async disconnectAsync(): Promise<void> {
    if (
      this.device.opened &&
      (this.transport as any).interfaceNumber !== undefined
    ) {
      return this.daplink.disconnect();
    }
  }

  // Send a packet to the micro:bit directly via WebUSB and return the response.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/transport/cmsis_dap.ts#L161
  private async send(packet: number[]): Promise<Uint8Array> {
    const array = Uint8Array.from(packet);
    await this.transport.write(array.buffer);

    const response = await this.transport.read();
    return new Uint8Array(response.buffer);
  }

  // Send a command along with relevant data to the micro:bit directly via WebUSB and handle the response.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/transport/cmsis_dap.ts#L74
  private async cmdNums(
    op: number /* DapCmd */,
    data: number[],
  ): Promise<Uint8Array> {
    data.unshift(op);

    const buf = await this.send(data);

    if (buf[0] !== op) {
      throw new Error(`Bad response for ${op} -> ${buf[0]}`);
    }

    switch (op) {
      case DapCmd.DAP_CONNECT:
      case DapCmd.DAP_INFO:
      case DapCmd.DAP_TRANSFER:
      case DapCmd.DAP_TRANSFER_BLOCK:
        break;
      default:
        if (buf[1] !== 0) {
          throw new Error(`Bad status for ${op} -> ${buf[1]}`);
        }
    }

    return buf;
  }

  // Read a certain register a specified amount of times.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/dap/dap.ts#L117
  private async readRegRepeat(
    regId: number /* Reg */,
    cnt: number,
  ): Promise<Uint8Array> {
    const request = regRequest(regId);
    const sendargs = [0, cnt];

    for (let i = 0; i < cnt; ++i) {
      sendargs.push(request);
    }

    // Transfer the read requests to the micro:bit and retrieve the data read.
    const buf = await this.cmdNums(DapCmd.DAP_TRANSFER, sendargs);

    if (buf[1] !== cnt) {
      throw new Error("(many) Bad #trans " + buf[1]);
    } else if (buf[2] !== 1) {
      throw new Error("(many) Bad transfer status " + buf[2]);
    }

    return buf.subarray(3, 3 + cnt * 4);
  }

  // Write to a certain register a specified amount of data.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/dap/dap.ts#L138
  private async writeRegRepeat(
    regId: number /* Reg */,
    data: Uint32Array,
  ): Promise<void> {
    const request = regRequest(regId, true);
    const sendargs = [0, data.length, 0, request];

    data.forEach((d) => {
      // separate d into bytes
      sendargs.push(
        d & 0xff,
        (d >> 8) & 0xff,
        (d >> 16) & 0xff,
        (d >> 24) & 0xff,
      );
    });

    // Transfer the write requests to the micro:bit and retrieve the response status.
    const buf = await this.cmdNums(DapCmd.DAP_TRANSFER_BLOCK, sendargs);

    if (buf[3] !== 1) {
      throw new Error("(many-wr) Bad transfer status " + buf[2]);
    }
  }

  // Core functionality reading a block of data from micro:bit RAM at a specified address.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/memory/memory.ts#L181
  private async readBlockCore(
    addr: number,
    words: number,
  ): Promise<Uint8Array> {
    // Set up CMSIS-DAP to read/write from/to the RAM address addr using the register
    // ApReg.DRW to write to or read from.
    await this.cortexM.writeAP(ApReg.CSW, Csw.CSW_VALUE | Csw.CSW_SIZE32);
    await this.cortexM.writeAP(ApReg.TAR, addr);

    let lastSize = words % 15;
    if (lastSize === 0) {
      lastSize = 15;
    }

    const blocks = [];

    for (let i = 0; i < Math.ceil(words / 15); i++) {
      const b: Uint8Array = await this.readRegRepeat(
        apReg(ApReg.DRW, DapVal.READ),
        i === blocks.length - 1 ? lastSize : 15,
      );
      blocks.push(b);
    }

    return bufferConcat(blocks).subarray(0, words * 4);
  }

  // Core functionality writing a block of data to micro:bit RAM at a specified address.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/memory/memory.ts#L205
  private async writeBlockCore(
    addr: number,
    words: Uint32Array,
  ): Promise<void> {
    try {
      // Set up CMSIS-DAP to read/write from/to the RAM address addr using the register ApReg.DRW to write to or read from.
      await this.cortexM.writeAP(ApReg.CSW, Csw.CSW_VALUE | Csw.CSW_SIZE32);
      await this.cortexM.writeAP(ApReg.TAR, addr);

      await this.writeRegRepeat(apReg(ApReg.DRW, DapVal.WRITE), words);
    } catch (e: any) {
      if (e.dapWait) {
        // Retry after a delay if required.
        this.logging.log(`Transfer wait, write block`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return await this.writeBlockCore(addr, words);
      } else {
        throw e;
      }
    }
  }

  // Reads a block of data from micro:bit RAM at a specified address.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/memory/memory.ts#L143
  async readBlockAsync(addr: number, words: number): Promise<Uint8Array> {
    const bufs = [];
    const end = addr + words * 4;
    let ptr = addr;

    // Read a single page at a time.
    while (ptr < end) {
      let nextptr = ptr + this.pageSize;
      if (ptr === addr) {
        nextptr &= ~(this.pageSize - 1);
      }
      const len = Math.min(nextptr - ptr, end - ptr);
      bufs.push(await this.readBlockCore(ptr, len >> 2));
      ptr = nextptr;
    }
    const result = bufferConcat(bufs);
    return result.subarray(0, words * 4);
  }

  // Writes a block of data to micro:bit RAM at a specified address.
  async writeBlockAsync(address: number, data: Uint32Array): Promise<void> {
    let payloadSize = this.transport.packetSize - 8;
    if (data.buffer.byteLength > payloadSize) {
      let start = 0;
      let end = payloadSize;

      // Split write up into smaller writes whose data can each be held in a single packet.
      while (start !== end) {
        let temp = new Uint32Array(data.buffer.slice(start, end));
        await this.writeBlockCore(address + start, temp);

        start = end;
        end = Math.min(data.buffer.byteLength, end + payloadSize);
      }
    } else {
      await this.writeBlockCore(address, data);
    }
  }

  // Execute code at a certain address with specified values in the registers.
  // Waits for execution to halt.
  async executeAsync(
    address: number,
    code: Uint32Array,
    sp: number,
    pc: number,
    lr: number,
    ...registers: number[]
  ) {
    if (registers.length > 12) {
      throw new Error(
        `Only 12 general purpose registers but got ${registers.length} values`,
      );
    }

    await this.cortexM.halt(true);
    await this.writeBlockAsync(address, code);
    await this.cortexM.writeCoreRegister(CoreRegister.PC, pc);
    await this.cortexM.writeCoreRegister(CoreRegister.LR, lr);
    await this.cortexM.writeCoreRegister(CoreRegister.SP, sp);
    for (let i = 0; i < registers.length; ++i) {
      await this.cortexM.writeCoreRegister(i, registers[i]);
    }
    await this.cortexM.resume(true);
    return this.waitForHalt();
  }

  // Checks whether the micro:bit has halted or timeout has been reached.
  // Recurses otherwise.
  private async waitForHaltCore(
    halted: boolean,
    deadline: number,
  ): Promise<void> {
    if (new Date().getTime() > deadline) {
      throw new Error("timeout");
    }
    if (!halted) {
      const isHalted = await this.cortexM.isHalted();
      // NB this is a Promise so no stack risk.
      return this.waitForHaltCore(isHalted, deadline);
    }
  }

  // Initial function to call to wait for the micro:bit halt.
  async waitForHalt(timeToWait = 10000): Promise<void> {
    const deadline = new Date().getTime() + timeToWait;
    return this.waitForHaltCore(false, deadline);
  }

  // Resets the micro:bit in software by writing to NVIC_AIRCR.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/cortex/cortex.ts#L347
  async softwareReset() {
    await this.cortexM.writeMem32(
      CortexSpecialReg.NVIC_AIRCR,
      CortexSpecialReg.NVIC_AIRCR_VECTKEY |
        CortexSpecialReg.NVIC_AIRCR_SYSRESETREQ,
    );

    // wait for the system to come out of reset
    let dhcsr = await this.cortexM.readMem32(CortexSpecialReg.DHCSR);

    while ((dhcsr & CortexSpecialReg.S_RESET_ST) !== 0) {
      dhcsr = await this.cortexM.readMem32(CortexSpecialReg.DHCSR);
    }
  }

  // Reset the micro:bit, possibly halting the core on reset.
  // Drawn from https://github.com/mmoskal/dapjs/blob/a32f11f54e9e76a9c61896ddd425c1cb1a29c143/src/cortex/cortex.ts#L248
  async reset(halt = false) {
    if (halt) {
      await this.cortexM.halt(true);

      // VC_CORERESET causes the core to halt on reset.
      const demcr = await this.cortexM.readMem32(CortexSpecialReg.DEMCR);
      await this.cortexM.writeMem32(
        CortexSpecialReg.DEMCR,
        CortexSpecialReg.DEMCR | CortexSpecialReg.DEMCR_VC_CORERESET,
      );

      await this.softwareReset();
      await this.waitForHalt();

      // Unset the VC_CORERESET bit
      await this.cortexM.writeMem32(CortexSpecialReg.DEMCR, demcr);
    } else {
      await this.softwareReset();
    }
  }
}
