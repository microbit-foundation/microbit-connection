/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TypedEventTarget } from "./events.js";

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
  | "reconnect-microbit"
  /**
   * Error occured during serial or bluetooth communication.
   */
  | "background-comms-error"
  /**
   * Bluetooth service is missing on device.
   */
  | "service-missing";

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
  SUPPORT_NOT_KNOWN = "SUPPORT_NOT_KNOWN",
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
  NO_AUTHORIZED_DEVICE = "NO_AUTHORIZED_DEVICE",
  /**
   * Authorized device available but we haven't connected to it.
   */
  DISCONNECTED = "DISCONNECTED",
  /**
   * Connected.
   */
  CONNECTED = "CONNECTED",
  /**
   * Connecting.
   */
  CONNECTING = "CONNECTING",
  /**
   * Reconnecting. When there is unexpected disruption in the connection,
   * a reconnection is attempted.
   */
  RECONNECTING = "RECONNECTING",
}

export interface FlashOptions {
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
  /**
   * Smallest possible progress increment to limit callback rate.
   */
  minimumProgressIncrement?: number;
}

export class FlashDataError extends Error {}

export type FlashDataSource = (
  boardVersion: BoardVersion,
) => Promise<string | Uint8Array>;

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

export class BackgroundErrorEvent extends Event {
  constructor(public readonly errorMessage: string) {
    super("backgrounderror");
  }
}

export class DeviceConnectionEventMap {
  "status": ConnectionStatusEvent;
  "serialdata": SerialDataEvent;
  "serialreset": Event;
  "serialerror": SerialErrorEvent;
  "flash": Event;
  "beforerequestdevice": Event;
  "afterrequestdevice": Event;
  "backgrounderror": BackgroundErrorEvent;
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
  connect(): Promise<ConnectionStatus>;

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
  flash?(dataSource: FlashDataSource, options: {}): Promise<void>;

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
