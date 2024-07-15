/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TypedEventTarget } from "./events.js";
import { BoardId } from "./board-id.js";

/**
 * Specific identified error types.
 *
 * New members may be added over time.
 */
export type DeviceErrorCode =
  /**
   * Device not selected, e.g. because the user cancelled the dialog.
   */
  | "no-device-selected"
  /**
   * Device not found, perhaps because it doesn't have new enough firmware (for V1).
   */
  | "update-req"
  /**
   * Unable to claim the interface, usually because it's in use in another tab/window.
   */
  | "clear-connect"
  /**
   * The device was found to be disconnected.
   */
  | "device-disconnected"
  /**
   * A communication timeout occurred.
   */
  | "timeout-error"
  /**
   * This is the fallback error case suggesting that the user reconnects their device.
   */
  | "reconnect-microbit";

/**
 * Error type used for all interactions with this module.
 *
 * The code indicates the error type and may be suitable for providing
 * translated error messages.
 *
 * The message is the underlying message text and will usually be in
 * English.
 */
export class DeviceError extends Error {
  code: DeviceErrorCode;
  constructor({ code, message }: { code: DeviceErrorCode; message?: string }) {
    super(message);
    this.code = code;
  }
}

/**
 * Tracks connection status,
 */
export enum ConnectionStatus {
  /**
   * Determining whether the connection type is supported requires
   * initialize() to complete.
   */
  SUPPORT_NOT_KNOWN,
  /**
   * Not supported.
   */
  NOT_SUPPORTED = "NOT_SUPPORTED",
  /**
   * Supported but no device available.
   *
   * This will be the case even when a device is physically connected
   * but has not been connected via the browser security UI.
   */
  NO_AUTHORIZED_DEVICE = "NO_DEVICE",
  /**
   * Authorized device available but we haven't connected to it.
   */
  NOT_CONNECTED = "NOT_CONNECTED",
  /**
   * Connected.
   */
  CONNECTED = "CONNECTED",
}

export class FlashDataError extends Error {}

export interface FlashDataSource {
  /**
   * For now we only support partially flashing contiguous data.
   * This can be generated from microbit-fs directly (via getIntelHexBytes())
   * or from an existing Intel Hex via slicePad.
   *
   * This interface is quite confusing and worth revisiting.
   *
   * @param boardId the id of the board.
   * @throws FlashDataError if we cannot generate hex data.
   */
  partialFlashData(boardId: BoardId): Promise<Uint8Array>;

  /**
   * @param boardId the id of the board.
   * @returns A board-specific (non-universal) Intel Hex file for the given board id.
   * @throws FlashDataError if we cannot generate hex data.
   */
  fullFlashData(boardId: BoardId): Promise<string>;
}

export interface ConnectOptions {
  serial?: boolean;
  // Name filter used for Web Bluetooth
  name?: string;
}

export type BoardVersion = "V1" | "V2";

export class ConnectionStatusEvent extends Event {
  constructor(public readonly status: ConnectionStatus) {
    super("status");
  }
}

export class SerialDataEvent extends Event {
  constructor(public readonly data: string) {
    super("serialdata");
  }
}

export class SerialResetEvent extends Event {
  constructor() {
    super("serialreset");
  }
}

export class SerialErrorEvent extends Event {
  constructor(public readonly error: unknown) {
    super("serialerror");
  }
}

export class FlashEvent extends Event {
  constructor() {
    super("flash");
  }
}

export class BeforeRequestDevice extends Event {
  constructor() {
    super("beforerequestdevice");
  }
}

export class AfterRequestDevice extends Event {
  constructor() {
    super("afterrequestdevice");
  }
}

export class DeviceConnectionEventMap {
  "status": ConnectionStatusEvent;
  "serialdata": SerialDataEvent;
  "serialreset": Event;
  "serialerror": Event;
  "flash": Event;
  "beforerequestdevice": Event;
  "afterrequestdevice": Event;
}

export interface DeviceConnection
  extends TypedEventTarget<DeviceConnectionEventMap> {
  status: ConnectionStatus;

  /**
   * Initializes the device.
   */
  initialize(): Promise<void>;
  /**
   * Removes all listeners.
   */
  dispose(): void;

  /**
   * Connects to a currently paired device or requests pairing.
   * Throws on error.
   *
   * @returns the final connection status.
   */
  connect(options?: ConnectOptions): Promise<ConnectionStatus>;

  /**
   * Get the board version.
   *
   * @returns the board version or null if there is no connection.
   */
  getBoardVersion(): BoardVersion | undefined;

  /**
   * Flash the micro:bit.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   */
  flash?(
    dataSource: FlashDataSource,
    options: {
      /**
       * True to use a partial flash where possible, false to force a full flash.
       */
      partial: boolean;
      /**
       * A progress callback. Called with undefined when the process is complete or has failed.
       *
       * Requesting a partial flash doesn't guarantee one is performed. Partial flashes are avoided
       * if too many blocks have changed and failed partial flashes are retried as full flashes.
       * The partial parameter reports the flash type currently in progress.
       */
      progress: (percentage: number | undefined, partial: boolean) => void;
    },
  ): Promise<void>;

  /**
   * Disconnect from the device.
   */
  disconnect(): Promise<void>;

  /**
   * Write serial data to the device.
   *
   * Does nothting if there is no connection.
   *
   * @param data The data to write.
   * @returns A promise that resolves when the write is complete.
   */
  serialWrite(data: string): Promise<void>;

  /**
   * Clear device to enable chooseDevice.
   */
  clearDevice(): void;
}
