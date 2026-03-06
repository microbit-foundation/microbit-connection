/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TypedEventTarget } from "./events.js";

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
   * This is the fallback error case suggesting that the user physically reconnects their device.
   */
  | "reconnect-microbit"
  /**
   * An operation was attempted that requires an active connection.
   */
  | "not-connected"
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

/**
 * Stages reported by the progress callback during connection and flashing.
 */
export const ProgressStage = {
  /** Checking permissions and availability before connecting. */
  Initializing: "Initializing",
  /** Finding device. */
  FindingDevice: "FindingDevice",
  /** Checking that a bond is established. Only applicable on Native platforms. */
  CheckingBond: "CheckingBond",
  /** Resetting device in preparation for flashing. Only applicable on Native platforms. */
  ResettingDevice: "ResettingDevice",
  /** Connecting for flashing. */
  Connecting: "Connecting",
  /** Partial flashing. */
  PartialFlashing: "PartialFlashing",
  /** Full flashing. */
  FullFlashing: "FullFlashing",
} as const;

export type ProgressStage = (typeof ProgressStage)[keyof typeof ProgressStage];

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
 * Asserts that a connection is active, throwing a {@link DeviceError}
 * with code `"not-connected"` if it is not.
 */
export function assertConnected<T>(
  connection: T | undefined,
): asserts connection is T {
  if (!connection) {
    throw new DeviceError({ code: "not-connected", message: "Not connected" });
  }
}

/**
 * Tracks connection status.
 */
export const ConnectionStatus = {
  /**
   * No device available.
   *
   * This is the initial status and will be the case even when a device is
   * physically connected but has not been connected via the browser security UI.
   *
   * Use checkAvailability() to determine whether the connection type is
   * supported before attempting to connect.
   */
  NoAuthorizedDevice: "NoAuthorizedDevice",
  /** Authorized device available but we haven't connected to it. */
  Disconnected: "Disconnected",
  /** Connected. */
  Connected: "Connected",
  /** Connecting. */
  Connecting: "Connecting",
  /**
   * Paused due to tab visibility. The connection was temporarily suspended
   * because the browser tab became hidden. Reconnection will be attempted
   * automatically when the tab becomes visible again.
   */
  Paused: "Paused",
} as const;

export type ConnectionStatus =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

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

export interface ConnectionStatusChange {
  status: ConnectionStatus;
  previousStatus: ConnectionStatus;
}

export interface BackgroundErrorData {
  message: string;
  error?: unknown;
}

export interface DeviceConnectionEventMap {
  status: ConnectionStatusChange;
  backgrounderror: BackgroundErrorData;
  beforerequestdevice: void;
  afterrequestdevice: void;
  flash: void;
}

export interface DeviceConnection<M>
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
   * Cached after the first successful connection until {@link clearDevice}
   * is called, so remains available after disconnection.
   *
   * @returns the board version.
   * @throws {DeviceError} with code `not-connected` if no device has been connected.
   */
  getBoardVersion(): BoardVersion;

  /**
   * Disconnect from the device.
   */
  disconnect(): Promise<void>;

  /**
   * Flash the micro:bit.
   *
   * Not all connection types support flashing. For example, radio bridge
   * connections do not support flashing, and Bluetooth connections only
   * support flashing on native platforms (not Web).
   *
   * Post-flash connection state differs by transport:
   *
   * - **USB**: The connection remains in {@link ConnectionStatus.Connected} state.
   *   USB connects to the micro:bit's interface chip (running DAPLink firmware),
   *   which is not affected by flashing the application processor, so the
   *   connection persists and serial communication is automatically reinitialised.
   *
   * - **Bluetooth**: The connection is always left in {@link ConnectionStatus.Disconnected}
   *   state. Bluetooth connects to the application processor directly, which
   *   reboots after flashing, so the connection is necessarily lost. Callers
   *   must call {@link connect} again after flashing.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   * @throws {DeviceError} On flash failure. The error.code property indicates the failure type.
   * @throws {FlashDataError} If data preparation fails.
   */
  flash?(dataSource: FlashDataSource, options: FlashOptions): Promise<void>;

  /**
   * Clear device to enable chooseDevice.
   */
  clearDevice(): Promise<void> | void;
}
