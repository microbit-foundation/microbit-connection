/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TypedEventTarget, ValueIsEvent } from "./events.js";

/**
 * Connection availability status returned by checkAvailability().
 * Used for pre-flight UX decisions before attempting to connect.
 */
export type ConnectionAvailabilityStatus =
  | "available"
  | "unsupported"
  | "disabled"
  | "permission-denied"
  | "location-disabled";

/**
 * Specific identified error types.
 *
 * New members may be added over time.
 */
export type DeviceErrorCode =
  /**
   * Operation was aborted via an AbortSignal.
   */
  | "aborted"
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
  | "service-missing"
  /**
   * Failed to establish Bluetooth connection.
   */
  | "bluetooth-connection-failed"
  /**
   * Pairing information lost on micro:bit.
   */
  | "pairing-information-lost"
  /**
   * Pairing not permitted. User cancelled pairing dialog in iOS.
   */
  | "pairing-not-permitted"
  /**
   * Partial flash operation failed.
   */
  | "flash-partial-failed"
  /**
   * Full flash operation failed.
   */
  | "flash-full-failed"
  /**
   * Flash operation was cancelled.
   */
  | "flash-cancelled"
  /**
   * Connection type is not supported on this platform/browser.
   * Aligns with ConnectionAvailabilityStatus "unsupported".
   */
  | "unsupported"
  /**
   * Connection is disabled (e.g., Bluetooth turned off).
   * Aligns with ConnectionAvailabilityStatus "disabled".
   */
  | "disabled"
  /**
   * Required permissions were denied.
   * Aligns with ConnectionAvailabilityStatus "permission-denied".
   */
  | "permission-denied"
  /**
   * Location services are disabled (Android < 12 only).
   * Aligns with ConnectionAvailabilityStatus "location-disabled".
   */
  | "location-disabled";

export enum ProgressStage {
  /**
   * Checking permissions and availability before connecting.
   */
  Initializing = "Initializing",
  /**
   * Finding device.
   */
  FindingDevice = "FindingDevice",
  /**
   * Checking that a bond is established. Only applicable on Native platforms.
   */
  CheckingBond = "CheckingBond",
  /**
   * Resetting device in preparation for flashing. Only applicable on Native platforms.
   */
  ResettingDevice = "ResettingDevice",
  /**
   * Connecting for flashing.
   */
  Connecting = "Connecting",
  /**
   * Partial flashing.
   */
  PartialFlashing = "PartialFlashing",
  /**
   * Full flashing.
   */
  FullFlashing = "FullFlashing",
}

/**
 * Progress callback for tracking operation stages (connection and flashing).
 *
 * @param stage - The current stage of the operation
 * @param progress - Optional progress value (0-1) for PartialFlashing and FullFlashing stages.
 *                   Initializing, FindingDevice, CheckingBond (only for native platforms),
 *                   ResettingDevice (only for native platforms), and Connecting stages are called once
 *                   without progress values to indicate stage entry.
 *
 * @example
 * const progressCallback = (stage, progress) => {
 *   if (progress !== undefined) {
 *     console.log(`${stage}: ${Math.round(progress * 100)}%`);
 *   } else {
 *     console.log(`Stage: ${stage}`);
 *   }
 * };
 */
export type ProgressCallback = (
  stage: ProgressStage,
  progress?: number,
) => void;

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
 * Tracks connection status.
 */
export enum ConnectionStatus {
  /**
   * No device available.
   *
   * This is the initial status and will be the case even when a device is
   * physically connected but has not been connected via the browser security UI.
   *
   * Use checkAvailability() to determine whether the connection type is
   * supported before attempting to connect.
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
   * Paused due to tab visibility. The connection was temporarily suspended
   * because the browser tab became hidden. Reconnection will be attempted
   * automatically when the tab becomes visible again.
   */
  PAUSED = "PAUSED",
}

export interface ConnectOptions {
  /**
   * Optional progress callback for tracking connection stages.
   */
  progress?: ProgressCallback;
  /**
   * Optional AbortSignal to abort the connection attempt.
   * When aborted, the connect promise will reject with a DeviceError
   * with code "aborted".
   *
   * Note: Currently only aborts during the FindingDevice stage on native
   * platforms. Web platform device selection (browser picker) cannot be
   * aborted programmatically.
   */
  signal?: AbortSignal;
  /**
   * Optional boolean to indicate whether device is already bonded for iOS.
   * When set to true, post bonding related processes will be skipped for iOS.
   */
  isIosBonded?: boolean;
}

export interface FlashOptions {
  /**
   * True to use a partial flash where possible, false to force a full flash.
   * Default: true.
   */
  partial?: boolean;
  /**
   * Optional progress callback for tracking connection and flash stages.
   *
   * Requesting a partial flash doesn't guarantee one is performed. Partial flashes are avoided
   * if too many blocks have changed and failed partial flashes are retried as full flashes.
   * The partial parameter reports the flash type currently in progress.
   */
  progress?: ProgressCallback;
  /**
   * Smallest possible progress increment to limit callback rate.
   */
  minimumProgressIncrement?: number;
  /**
   * Optional AbortSignal to abort the flash operation.
   * When aborted, the flash promise will reject with a DeviceError
   * with code "aborted".
   *
   * Note: Currently only aborts during the FindingDevice stage on native
   * platforms. Once a device is found and flashing begins, the operation
   * cannot be aborted.
   */
  signal?: AbortSignal;
}

export class FlashDataError extends Error {}

export type FlashDataSource = (
  boardVersion: BoardVersion,
) => Promise<string | Uint8Array>;

export type BoardVersion = "V1" | "V2";

export class ConnectionStatusEvent extends Event {
  constructor(
    public readonly status: ConnectionStatus,
    public readonly previousStatus: ConnectionStatus,
  ) {
    super("status");
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
  constructor(
    public readonly errorMessage: string,
    public readonly error?: unknown,
  ) {
    super("backgrounderror");
  }
}

export class DeviceConnectionEventMap {
  "status": ConnectionStatusEvent;
  "backgrounderror": BackgroundErrorEvent;
  "beforerequestdevice": Event;
  "afterrequestdevice": Event;
}

export interface DeviceConnection<M extends ValueIsEvent<M>>
  extends TypedEventTarget<DeviceConnectionEventMap & M> {
  status: ConnectionStatus;

  /**
   * Initializes the device.
   */
  initialize(): Promise<void>;

  /**
   * Checks if this connection type is currently available.
   *
   * Use this for pre-flight UX decisions (e.g., showing "enable Bluetooth" dialog).
   * Note: Even if this returns "available", connect() can still fail.
   *
   * @returns A promise resolving to the current availability status.
   */
  checkAvailability(): Promise<ConnectionAvailabilityStatus>;

  /**
   * Removes all listeners.
   */
  dispose(): void;

  /**
   * Connects to a currently paired device or requests pairing.
   *
   * @param options Optional connection options including progress callback and abort signal.
   * @throws {DeviceError} On connection failure. The error.code property indicates the failure type.
   */
  connect(options?: ConnectOptions): Promise<void>;

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
