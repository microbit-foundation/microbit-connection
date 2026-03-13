/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

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
 * Error codes identifying specific failure modes.
 *
 * Each code represents a distinct category of failure that apps can
 * match on to decide what message to show or what recovery to attempt.
 * New codes may be added in future minor releases.
 *
 * Codes are annotated with **USB**, **BLE**, or **USB, BLE** to indicate
 * which connection types can produce them. USB-only apps can ignore
 * BLE-only codes.
 */
export type DeviceErrorCode =
  // -- User cancelled (no error UI needed) --

  /**
   * **BLE.** The operation was cancelled via an {@link AbortSignal}
   * supplied by the caller. No user-facing error is needed.
   */
  | "aborted"
  /**
   * **USB, BLE.** The user dismissed the device-picker dialog without
   * selecting a device. Typically no error message is needed — the user
   * chose not to proceed.
   */
  | "no-device-selected"

  // -- Pre-connection / availability --

  /**
   * **USB, BLE.** The connection type is not supported on this platform
   * or browser. Corresponds to {@link ConnectionAvailabilityStatus}
   * `"unsupported"`.
   */
  | "unsupported"
  /**
   * **BLE.** Bluetooth is turned off at the OS level. Prompt the user
   * to enable it in system settings. Corresponds to
   * {@link ConnectionAvailabilityStatus} `"disabled"`.
   */
  | "disabled"
  /**
   * **BLE.** The app does not have the required Bluetooth permissions
   * (iOS/Android). Prompt the user to grant permission in system
   * settings. Corresponds to {@link ConnectionAvailabilityStatus}
   * `"permission-denied"`.
   */
  | "permission-denied"
  /**
   * **BLE.** Location services are disabled. Required on Android
   * versions before 12 for Bluetooth scanning. Prompt the user to
   * enable location in system settings. Corresponds to
   * {@link ConnectionAvailabilityStatus} `"location-disabled"`.
   */
  | "location-disabled"

  // -- Connection state --

  /**
   * **USB, BLE.** A method was called that requires an active
   * connection, but no connection is currently open. Call
   * {@link DeviceConnection.connect} first.
   */
  | "not-connected"
  /**
   * **USB.** The USB interface could not be claimed, usually because
   * another browser tab or application already has an open connection
   * to the device.
   */
  | "device-in-use"

  // -- Runtime communication failures --

  /**
   * **USB, BLE.** The device disconnected during an operation.
   * The physical USB or Bluetooth connection was lost.
   */
  | "device-disconnected"
  /**
   * **USB, BLE.** A communication timeout — the device did not respond
   * within the expected time. This may indicate the device is busy,
   * hung, or that the connection is degraded.
   */
  | "timeout"
  /**
   * **USB, BLE.** A communication failure that does not match any more
   * specific code. Typical handling: prompt the user to physically
   * disconnect and reconnect the device, then retry.
   */
  | "connection-error"

  // -- Device-specific --

  /**
   * **USB.** The USB device was found but lacks the expected CMSIS-DAP
   * interface. On micro:bit V1 this indicates the DAPLink firmware is
   * too old and needs updating.
   */
  | "firmware-update-required"
  /**
   * **BLE.** The micro:bit's Bluetooth pairing/bonding information has
   * been lost (e.g. after a firmware reflash). The user needs to
   * re-pair the device. Currently only detected on iOS.
   */
  | "pairing-information-lost";

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
  constructor({
    code,
    message,
    cause,
  }: {
    code: DeviceErrorCode;
    message?: string;
    cause?: unknown;
  }) {
    super(message, { cause });
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
  error: DeviceError;
  event?: string;
}

export interface DeviceConnectionEventMap {
  status: ConnectionStatusChange;
  backgrounderror: BackgroundErrorData;
  beforerequestdevice: void;
  afterrequestdevice: void;
  flash: void;
}

export interface DeviceConnection {
  addEventListener(
    type: "status",
    listener: (data: ConnectionStatusChange) => void,
  ): void;
  addEventListener(
    type: "backgrounderror",
    listener: (data: BackgroundErrorData) => void,
  ): void;
  addEventListener(type: "beforerequestdevice", listener: () => void): void;
  addEventListener(type: "afterrequestdevice", listener: () => void): void;
  addEventListener(type: "flash", listener: () => void): void;

  removeEventListener(
    type: "status",
    listener: (data: ConnectionStatusChange) => void,
  ): void;
  removeEventListener(
    type: "backgrounderror",
    listener: (data: BackgroundErrorData) => void,
  ): void;
  removeEventListener(type: "beforerequestdevice", listener: () => void): void;
  removeEventListener(type: "afterrequestdevice", listener: () => void): void;
  removeEventListener(type: "flash", listener: () => void): void;

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
