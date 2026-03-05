/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BoardSerialInfo } from "../board-serial-info.js";
import { FICR } from "../constants.js";
import { DeviceError, assertConnected } from "../device.js";
import { Logging } from "../logging.js";
import { ArmDebugInterface } from "./arm-debug.js";
import { CmsisDap } from "./cmsis-dap.js";
import { CortexM } from "./cortex-m.js";
import {
  DapLinkSerial,
  dapLinkFlash,
  readDaplinkUniqueId,
  readMem32WithRetry,
} from "./daplink.js";
import { UsbTransport } from "./transport.js";

export class USBDeviceWrapper {
  adi: ArmDebugInterface;
  cortexM: CortexM;
  private serial: DapLinkSerial;

  private _pageSize: number | undefined;
  private _numPages: number | undefined;
  private _deviceId: number | undefined;

  private _boardSerialInfo: BoardSerialInfo | undefined;
  private loggedBoardSerialInfo: BoardSerialInfo | undefined;

  private initialConnectionComplete: boolean = false;

  constructor(
    public readonly usbDevice: USBDevice,
    private logging: Logging,
  ) {
    const cmsisDap = new CmsisDap(
      new UsbTransport(this.usbDevice),
      this.logging,
    );
    this.adi = new ArmDebugInterface(cmsisDap, this.logging);
    this.cortexM = new CortexM(this.adi);
    this.serial = new DapLinkSerial(cmsisDap, this.logging);
  }

  /**
   * The page size. Throws if we've not connected.
   */
  get pageSize(): number {
    if (this._pageSize === undefined) {
      throw new DeviceError({
        code: "reconnect-microbit",
        message: "pageSize not defined until connected",
      });
    }
    return this._pageSize;
  }

  /**
   * The number of pages. Throws if we've not connected.
   */
  get numPages() {
    if (this._numPages === undefined) {
      throw new DeviceError({
        code: "reconnect-microbit",
        message: "numPages not defined until connected",
      });
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
    assertConnected(this._boardSerialInfo);
    return this._boardSerialInfo;
  }

  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L119
  async reconnect(): Promise<void> {
    if (this.initialConnectionComplete) {
      await this.disconnect();
    } else {
      this.initialConnectionComplete = true;
    }

    await this.adi.connect();

    // Read the unique ID via DAPLink vendor command 0x80.
    // Chrome may anonymize USBDevice.serialNumber for anti-fingerprinting
    // (https://github.com/microbit-foundation/microbit-connection/issues/57)
    // so we read it via the DAP protocol instead.
    const dapSerial = await readDaplinkUniqueId(this.adi.dap, this.logging);
    if (dapSerial) {
      this._boardSerialInfo = BoardSerialInfo.fromSerial(
        dapSerial,
        this.logging.log.bind(this.logging),
      );
    } else {
      this.logging.log(
        "Failed to read unique ID via DAP vendor command, falling back to USB serial number (may be affected by anti-fingerprinting)",
      );
      this._boardSerialInfo = BoardSerialInfo.parse(
        this.usbDevice,
        this.logging.log.bind(this.logging),
      );
    }

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
    // We retry on errors as immediately after flash the micro:bit won't be ready to respond
    this._deviceId = await readMem32WithRetry(
      this.adi,
      FICR.DEVICE_ID_1,
      this.logging,
    );

    this._pageSize = await readMem32WithRetry(
      this.adi,
      FICR.CODEPAGESIZE,
      this.logging,
    );
    this._numPages = await readMem32WithRetry(
      this.adi,
      FICR.CODESIZE,
      this.logging,
    );
  }

  async startSerial(listener: (data: string) => void): Promise<void> {
    const currentBaud = await this.serial.getBaudrate();
    if (currentBaud !== 115200) {
      // Changing the baud rate causes a micro:bit reset, so only do it if necessary
      await this.serial.setBaudrate(115200);
    }
    await this.serial.startPolling(listener, 1);
  }

  stopSerial(): void {
    this.serial.stopPolling();
  }

  async serialWrite(data: string): Promise<void> {
    await this.serial.write(data);
  }

  async drainSerialBuffer(): Promise<void> {
    await this.serial.drain();
  }

  async disconnect(): Promise<void> {
    if (this.usbDevice.opened && this.adi.isOpen) {
      return this.adi.disconnect();
    }
  }

  /**
   * Full flash via DAPLink vendor commands.
   * USB transport must already be open (from connect).
   */
  async flash(
    buffer: Uint8Array,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await dapLinkFlash(this.adi, buffer, onProgress);
  }
}
