/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BoardSerialInfo } from "../board-serial-info.js";
import { FICR } from "../constants.js";
import { Logging } from "../logging.js";
import { ArmDebugInterface } from "./arm-debug.js";
import { CmsisDap } from "./cmsis-dap.js";
import { CortexM } from "./cortex-m.js";
import {
  DapLinkSerial,
  readDaplinkUniqueId,
  readMem32WithRetry,
} from "./daplink.js";
import { UsbTransport } from "./transport.js";

export interface BoardConnectionInfo {
  boardSerialInfo: BoardSerialInfo;
  deviceId: number;
  pageSize: number;
  numPages: number;
}

export class USBDeviceWrapper {
  adi: ArmDebugInterface;
  cortexM: CortexM;
  serial: DapLinkSerial;

  private initialConnectionComplete = false;

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

  // Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L119
  async reconnect(): Promise<BoardConnectionInfo> {
    if (this.initialConnectionComplete) {
      await this.disconnect();
    } else {
      this.initialConnectionComplete = true;
    }

    await this.adi.connect();

    const boardSerialInfo = await this.readBoardSerialInfo();
    this.logging.log(`Detected board ID ${boardSerialInfo.id}`);

    // https://support.microbit.org/support/solutions/articles/19000067679-how-to-find-the-name-of-your-micro-bit
    // We retry on errors as immediately after flash the micro:bit won't be ready to respond
    const deviceId = await readMem32WithRetry(
      this.adi,
      FICR.DEVICE_ID_1,
      this.logging,
    );
    const pageSize = await readMem32WithRetry(
      this.adi,
      FICR.CODEPAGESIZE,
      this.logging,
    );
    const numPages = await readMem32WithRetry(
      this.adi,
      FICR.CODESIZE,
      this.logging,
    );

    return { boardSerialInfo, deviceId, pageSize, numPages };
  }

  /**
   * Read the board serial info, preferring the DAPLink vendor command.
   * Chrome may anonymize USBDevice.serialNumber for anti-fingerprinting
   * (https://github.com/microbit-foundation/microbit-connection/issues/57)
   * so we read it via the DAP protocol instead.
   */
  private async readBoardSerialInfo(): Promise<BoardSerialInfo> {
    const dapSerial = await readDaplinkUniqueId(this.adi.dap, this.logging);
    if (dapSerial) {
      return BoardSerialInfo.fromSerial(
        dapSerial,
        this.logging.log.bind(this.logging),
      );
    }
    this.logging.log(
      "Failed to read unique ID via DAP vendor command, falling back to USB serial number (may be affected by anti-fingerprinting)",
    );
    return BoardSerialInfo.parse(
      this.usbDevice,
      this.logging.log.bind(this.logging),
    );
  }

  async disconnect(): Promise<void> {
    if (this.usbDevice.opened && this.adi.isOpen) {
      return this.adi.disconnect();
    }
  }
}
