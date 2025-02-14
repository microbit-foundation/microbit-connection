/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { AccelerometerData } from "./accelerometer.js";
import { TypedEventTarget } from "./events.js";
import { LedMatrix } from "./led.js";
import { MagnetometerData } from "./magnetometer.js";
import { UARTDataEvent } from "./uart.js";

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
  "uartdata": UARTDataEvent;
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
   * @returns the board version or undefined if there is no connection.
   */
  getBoardVersion(): BoardVersion | undefined;

  /**
   * Disconnect from the device.
   */
  disconnect(): Promise<void>;

  /**
   * Write serial data to the device.
   *
   * Does nothing if there is no connection.
   *
   * @param data The data to write.
   * @returns A promise that resolves when the write is complete.
   */
  serialWrite(data: string): Promise<void>;

  /**
   * Clear device to enable chooseDevice.
   */
  clearDevice(): Promise<void> | void;
}

export interface MicrobitWebUSBConnection extends DeviceConnection {
  /**
   * Gets micro:bit deviceId.
   *
   * @returns the device id or undefined if there is no connection.
   */
  getDeviceId(): number | undefined;

  /**
   * Sets device request exclusion filters.
   */
  setRequestDeviceExclusionFilters(exclusionFilters: USBDeviceFilter[]): void;

  /**
   * Flash the micro:bit.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   */
  flash(dataSource: FlashDataSource, options: {}): Promise<void>;

  /**
   * Gets micro:bit device.
   *
   * @returns the USB device or undefined if there is no connection.
   */
  getDevice(): USBDevice | undefined;

  /**
   * Resets the micro:bit in software.
   */
  softwareReset(): Promise<void>;
}

export interface MicrobitWebBluetoothConnection extends DeviceConnection {
  /**
   * Sets micro:bit name filter for device requesting.
   *
   * @param name The name of the micro:bit.
   */
  setNameFilter(name: string): void;

  /**
   * Gets micro:bit accelerometer data.
   *
   * @returns accelerometer data or undefined if there is no connection.
   */
  getAccelerometerData(): Promise<AccelerometerData | undefined>;

  /**
   * Gets micro:bit accelerometer period.
   *
   * @returns accelerometer period or undefined if there is no connection.
   */
  getAccelerometerPeriod(): Promise<number | undefined>;

  /**
   * Sets micro:bit accelerometer period.
   *
   * @param value The accelerometer period.
   */
  setAccelerometerPeriod(value: number): Promise<void>;

  /**
   * Sets micro:bit LED text.
   *
   * @param text The text displayed on micro:bit LED.
   */
  setLedText(text: string): Promise<void>;

  /**
   * Gets micro:bit LED scrolling delay.
   *
   * @returns LED scrolling delay in milliseconds.
   */
  getLedScrollingDelay(): Promise<number | undefined>;

  /**
   * Sets micro:bit LED scrolling delay.
   *
   * @param delayInMillis LED scrolling delay in milliseconds.
   */
  setLedScrollingDelay(delayInMillis: number): Promise<void>;

  /**
   * Gets micro:bit LED matrix.
   *
   * @returns a boolean matrix representing the micro:bit LED display.
   */
  getLedMatrix(): Promise<LedMatrix | undefined>;

  /**
   * Sets micro:bit LED matrix.
   *
   * @param matrix an boolean matrix representing the micro:bit LED display.
   */
  setLedMatrix(matrix: LedMatrix): Promise<void>;

  /**
   * Gets micro:bit magnetometer data.
   *
   * @returns magnetometer data.
   */
  getMagnetometerData(): Promise<MagnetometerData | undefined>;

  /**
   * Gets micro:bit magnetometer bearing.
   *
   * @returns magnetometer bearing.
   */
  getMagnetometerBearing(): Promise<number | undefined>;

  /**
   * Gets micro:bit magnetometer period.
   *
   * @returns magnetometer period.
   */
  getMagnetometerPeriod(): Promise<number | undefined>;

  /**
   * Sets micro:bit magnetometer period.
   *
   * @param value magnetometer period.
   */
  setMagnetometerPeriod(value: number): Promise<void>;

  /**
   * Triggers micro:bit magnetometer calibration.
   */
  triggerMagnetometerCalibration(): Promise<void>;

  /**
   * Write UART messages.
   *
   * @param data UART message.
   */
  writeUART(data: Uint8Array): Promise<void>;
}

export interface MicrobitRadioBridgeConnection extends DeviceConnection {
  /**
   * Sets remote device.
   *
   * @param deviceId The device id of remote micro:bit.
   */
  setRemoteDeviceId(deviceId: number): void;
}
