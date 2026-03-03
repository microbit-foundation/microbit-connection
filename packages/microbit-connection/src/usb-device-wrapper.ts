/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BoardSerialInfo } from "./board-serial-info.js";
import {
  CmsisDap,
  CortexM,
  DapLinkSerial,
  DapTransferError,
  dapLinkFlash,
} from "./cmsis-dap.js";
import { DapLinkVendorCmd, FICR } from "./constants.js";
import { DeviceError, assertConnected } from "./device.js";
import { Logging } from "./logging.js";

export class USBDeviceWrapper {
  dap: CmsisDap;
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
    this.dap = new CmsisDap(this.usbDevice);
    this.cortexM = new CortexM(this.dap);
    this.serial = new DapLinkSerial(this.dap);
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

    await this.connectDaplink();

    // Read the serial/unique ID via DAPLink vendor command 0x80.
    // Chrome may anonymize USBDevice.serialNumber for anti-fingerprinting
    // (https://github.com/microbit-foundation/microbit-connection/issues/57)
    // so we read it via the DAP protocol instead.
    const dapSerial = await this.readDaplinkSerial();
    if (dapSerial) {
      this._boardSerialInfo = BoardSerialInfo.fromSerial(
        dapSerial,
        this.logging.log.bind(this.logging),
      );
    } else {
      this.logging.log(
        "Failed to read serial via DAP vendor command, falling back to USB serial number (may be affected by anti-fingerprinting)",
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
    // We wait on errors as immediately after flash the micro:bit won't be ready to respond
    this._deviceId = await this.readMem32WaitOnError(FICR.DEVICE_ID_1);

    this._pageSize = await this.readMem32WaitOnError(FICR.CODEPAGESIZE);
    this._numPages = await this.readMem32WaitOnError(FICR.CODESIZE);
  }

  private async readMem32WaitOnError(register: number): Promise<number> {
    let retries = 0;
    let lastError: Error | undefined;
    while (retries < 20) {
      try {
        return await this.dap.readMem32(register);
      } catch (e) {
        if (e instanceof DapTransferError) {
          lastError = e;
          retries++;
          await new Promise((resolve) => setTimeout(resolve, 20));
        } else {
          throw e;
        }
      }
    }
    throw lastError;
  }

  /**
   * Connect daplink, handling stale USB responses from a previous session.
   * connect() leaves the transport open on failure so we can drain and retry.
   * See: https://github.com/microbit-foundation/python-editor-v3/issues/89
   */
  private async connectDaplink(maxRetries = 3): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logging.log(
            `Connection retry attempt ${attempt + 1}/${maxRetries}`,
          );
          await this.dap.drain(this.logging);
        }

        await this.dap.connect();
        return;
      } catch (e) {
        if (
          e instanceof DeviceError &&
          e.code === "reconnect-microbit" &&
          e.message.startsWith("Bad response for ")
        ) {
          lastError = e;
          this.logging.log(`Bad response error during connect: ${e.message}`);
          continue;
        }
        throw e;
      }
    }

    throw lastError || new Error("Connection failed after retries");
  }

  /**
   * Reconnect the CMSIS-DAP protocol layer without full re-initialization.
   * Used after flash to reinstate serial communication.
   */
  async reconnectDaplink(): Promise<void> {
    await this.dap.connect();
  }

  /**
   * Read the DAPLink unique ID via vendor command 0x80.
   * This returns the same 48-char hex string as the USB serial number
   * but isn't affected by browser anti-fingerprinting.
   */
  private async readDaplinkSerial(): Promise<string | undefined> {
    try {
      // send() validates that byte 0 matches the command
      const result = await this.dap.send(DapLinkVendorCmd.READ_UNIQUE_ID);
      const length = result.getUint8(1);
      if (length === 0) {
        return undefined;
      }
      // The response is [cmd, length, ...ascii_bytes].
      // DAPLink uses strlen() for the length so no null terminator is included.
      const bytes = new Uint8Array(result.buffer, 2, length);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      this.logging.log(
        `Error reading DAPLink serial: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  async startSerial(listener: (data: string) => void): Promise<void> {
    const currentBaud = await this.serial.getSerialBaudrate();
    if (currentBaud !== 115200) {
      // Changing the baud rate causes a micro:bit reset, so only do it if necessary
      await this.serial.setSerialBaudrate(115200);
    }
    await this.serial.startSerialRead(listener, 1);
  }

  stopSerial(): void {
    this.serial.stopSerialRead();
  }

  async serialWrite(data: string): Promise<void> {
    await this.serial.serialWrite(data);
  }

  async disconnect(): Promise<void> {
    if (this.usbDevice.opened && this.dap.isOpen) {
      return this.dap.disconnect();
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
    await dapLinkFlash(this.dap, buffer, onProgress);
  }
}
