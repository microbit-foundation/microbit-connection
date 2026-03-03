/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BleClient, BleDevice } from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import MemoryMap from "nrf-intel-hex";
import { AccelerometerData } from "./accelerometer.js";
import {
  BluetoothDeviceWrapper,
  isAndroid,
  scanningTimeoutInMs,
} from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import {
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  assertConnected,
  FlashDataSource,
  FlashOptions,
  ProgressCallback,
  ProgressStage,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { LedMatrix } from "./led.js";
import { Logging, ConsoleLogging } from "./logging.js";
import { MagnetometerData } from "./magnetometer.js";
import { fullFlash } from "./flashing/flashing-full.js";
import partialFlash, {
  PartialFlashResult,
} from "./flashing/flashing-partial.js";
import {
  ServiceConnectionEventMap,
  TypedServiceEvent,
} from "./service-events.js";

import { throwIfUnavailable } from "./availability.js";
import { truncateHexAfterEof } from "./hex-util.js";
import {
  DefaultDeviceBondState,
  DeviceBondState,
} from "./device-bond-state.js";
import { TimeoutError } from "./async-util.js";

type BleClientError = { message: string; errorMessage: string };

let bleClientInitialized = false;

export interface MicrobitBluetoothConnectionOptions {
  logging?: Logging;
  deviceBondState?: DeviceBondState;
}

export interface MicrobitBluetoothConnection
  extends DeviceConnection<ServiceConnectionEventMap> {
  /**
   * Sets micro:bit name filter for device requesting.
   *
   * @param name The name of the micro:bit.
   */
  setNameFilter(name: string): void;

  /**
   * Gets micro:bit accelerometer data.
   *
   * @returns accelerometer data.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getAccelerometerData(): Promise<AccelerometerData>;

  /**
   * Gets micro:bit accelerometer period.
   *
   * @returns accelerometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getAccelerometerPeriod(): Promise<number>;

  /**
   * Sets micro:bit accelerometer period.
   *
   * @param value The accelerometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setAccelerometerPeriod(value: number): Promise<void>;

  /**
   * Sets micro:bit LED text.
   *
   * @param text The text displayed on micro:bit LED.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedText(text: string): Promise<void>;

  /**
   * Gets micro:bit LED scrolling delay.
   *
   * @returns LED scrolling delay in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getLedScrollingDelay(): Promise<number>;

  /**
   * Sets micro:bit LED scrolling delay.
   *
   * @param delayInMillis LED scrolling delay in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedScrollingDelay(delayInMillis: number): Promise<void>;

  /**
   * Gets micro:bit LED matrix.
   *
   * @returns a boolean matrix representing the micro:bit LED display.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getLedMatrix(): Promise<LedMatrix>;

  /**
   * Sets micro:bit LED matrix.
   *
   * @param matrix an boolean matrix representing the micro:bit LED display.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedMatrix(matrix: LedMatrix): Promise<void>;

  /**
   * Gets micro:bit magnetometer data.
   *
   * @returns magnetometer data.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerData(): Promise<MagnetometerData>;

  /**
   * Gets micro:bit magnetometer bearing.
   *
   * @returns magnetometer bearing.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerBearing(): Promise<number>;

  /**
   * Gets micro:bit magnetometer period.
   *
   * @returns magnetometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerPeriod(): Promise<number>;

  /**
   * Sets micro:bit magnetometer period.
   *
   * @param value magnetometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setMagnetometerPeriod(value: number): Promise<void>;

  /**
   * Triggers micro:bit magnetometer calibration.
   *
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  triggerMagnetometerCalibration(): Promise<void>;

  /**
   * Write UART messages.
   *
   * @param data UART message.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  uartWrite(data: Uint8Array): Promise<void>;

  flash(dataSource: FlashDataSource, options: FlashOptions): Promise<void>;
}

/**
 * A Bluetooth connection factory.
 */
export const createBluetoothConnection = (
  options?: MicrobitBluetoothConnectionOptions,
): MicrobitBluetoothConnection => new MicrobitBluetoothConnectionImpl(options);

/**
 * A Bluetooth connection to a micro:bit device.
 */
class MicrobitBluetoothConnectionImpl
  extends TypedEventTarget<DeviceConnectionEventMap & ServiceConnectionEventMap>
  implements MicrobitBluetoothConnection
{
  status: ConnectionStatus = ConnectionStatus.NO_AUTHORIZED_DEVICE;

  /**
   * The USB device we last connected to.
   * Cleared if it is disconnected.
   */
  private device: BleDevice | undefined;

  private logging: Logging;
  private deviceBondState: DeviceBondState;
  private connection: BluetoothDeviceWrapper | undefined;

  /**
   * Cached device property that persists across reconnections until clearDevice.
   */
  private cachedBoardVersion: BoardVersion | undefined;

  private nameFilter: string | undefined;
  private deferredUpdatesPreviousStatus: ConnectionStatus | undefined;
  private waitForPostFlashDisconnectPromise: Promise<void> | undefined;

  constructor(options: MicrobitBluetoothConnectionOptions = {}) {
    super();
    this.logging = options.logging || new ConsoleLogging();
    this.deviceBondState =
      options.deviceBondState || new DefaultDeviceBondState();
  }

  protected eventActivated(type: string): void {
    this.connection?.startNotifications(type as TypedServiceEvent);
  }

  protected eventDeactivated(type: string): void {
    this.connection?.stopNotifications(type as TypedServiceEvent);
  }

  private log(v: any) {
    this.logging.log(v);
  }

  private error(message: string, e?: unknown) {
    this.logging.error(message, e);
  }

  async initialize(): Promise<void> {}

  dispose() {}

  async checkAvailability(): Promise<ConnectionAvailabilityStatus> {
    if (Capacitor.isNativePlatform()) {
      return this.checkNativeBluetoothAvailability();
    }
    return this.checkWebBluetoothAvailability();
  }

  private async checkWebBluetoothAvailability(): Promise<ConnectionAvailabilityStatus> {
    if (!navigator.bluetooth) {
      return "unsupported";
    }

    try {
      const available = await navigator.bluetooth.getAvailability();
      return available ? "available" : "disabled";
    } catch {
      return "disabled";
    }
  }

  private async checkNativeBluetoothAvailability(): Promise<ConnectionAvailabilityStatus> {
    try {
      // On Android, check if location services are enabled. This is only
      // required on Android < 12 (API < 31), but isLocationEnabled() returns
      // true on newer Android, so we can always check it.
      if (isAndroid()) {
        const isLocationEnabled = await BleClient.isLocationEnabled();
        if (!isLocationEnabled) {
          return "location-disabled";
        }
      }

      // Initialize BLE (requests permissions automatically on first call).
      if (!bleClientInitialized) {
        await BleClient.initialize({ androidNeverForLocation: true });
        bleClientInitialized = true;
      }

      // Check if Bluetooth is enabled.
      const isBluetoothEnabled = await BleClient.isEnabled();
      if (!isBluetoothEnabled) {
        return "disabled";
      }

      return "available";
    } catch (e) {
      // Handle errors from BleClient.initialize() which rejects for permission
      // or unsupported states. Error messages are hardcoded in the plugin:
      // https://github.com/capacitor-community/bluetooth-le/blob/main/ios/Plugin/DeviceManager.swift
      const errorMessage =
        e instanceof Error ? e.message : (e as BleClientError)?.message ?? "";
      this.log(`Bluetooth availability check failed: "${errorMessage}"`);

      if (errorMessage === "BLE permission denied") {
        return "permission-denied";
      }
      if (errorMessage === "BLE unsupported") {
        return "unsupported";
      }

      // Unknown error - default to permission-denied
      return "permission-denied";
    }
  }

  getBoardVersion(): BoardVersion {
    assertConnected(this.cachedBoardVersion);
    return this.cachedBoardVersion;
  }

  async connect(options?: ConnectOptions): Promise<void> {
    const progress = options?.progress ?? (() => {});

    // Check availability before connecting. Done here rather than at initialize()
    // because on Android/iOS that's the appropriate time to ask for permissions.
    progress(ProgressStage.Initializing);
    throwIfUnavailable(await this.checkAvailability());

    // After partial flashing, we will need to wait for connection to fully
    // disconnect before attempting to connect.
    this.waitForPostFlashDisconnectPromise &&
      (await this.waitForPostFlashDisconnectPromise);

    if (!this.device || !this.connection) {
      progress(ProgressStage.FindingDevice);
      const device = await this.requestDevice(options?.signal);
      this.connection = new BluetoothDeviceWrapper(
        device,
        this.logging,
        this.deviceBondState,
        this.dispatchEvent.bind(this),
        () => this.getActiveEvents() as Array<keyof ServiceConnectionEventMap>,
        {
          onConnecting: () => this.setStatus(ConnectionStatus.CONNECTING),
          onSuccess: () => this.setStatus(ConnectionStatus.CONNECTED),
          onDisconnect: () => this.setStatus(ConnectionStatus.DISCONNECTED),
        },
      );
    }

    await this.connection.connect(options);
    this.cachedBoardVersion = this.connection.boardVersion;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.disconnect();
      }
    } catch (e) {
      this.logging.event({
        type: "Bluetooth-error",
        message: "error-disconnecting",
      });
    } finally {
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.logging.event({
        type: "Bluetooth-info",
        message: "disconnected",
      });
    }
  }

  private setStatus(newStatus: ConnectionStatus) {
    const previousStatus = this.status;
    this.status = newStatus;
    this.log("Bluetooth connection status " + newStatus);
    if (this.deferredUpdatesPreviousStatus === undefined) {
      this.dispatchEvent("status", {
        status: newStatus,
        previousStatus,
      });
    }
  }

  async clearDevice(): Promise<void> {
    await this.disconnect();
    this.device = undefined;
    this.cachedBoardVersion = undefined;
    this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
  }

  setNameFilter(name: string) {
    this.nameFilter = name;
  }

  private async requestDevice(signal?: AbortSignal): Promise<BleDevice> {
    // Support both the default "BBC micro:bit" name and the shorter "uBit"
    // name used by some MakeCode extensions (e.g. bsiever/microbit-pxt-blehid).
    // See https://github.com/bsiever/microbit-pxt-blehid/issues/31
    const namePrefixes = this.nameFilter
      ? [`BBC micro:bit [${this.nameFilter}]`, `uBit [${this.nameFilter}]`]
      : ["BBC micro:bit", "uBit"];

    // If we have a cached device, check if it still matches the current filter.
    // If not, clear it so we find a new device.
    if (this.device) {
      if (namePrefixes.some((p) => this.device!.name?.startsWith(p))) {
        return this.device;
      }
      this.log(
        `Cached device "${this.device.name}" doesn't match filters "${namePrefixes.join(", ")}", clearing`,
      );
      await this.clearDevice();
    }

    this.dispatchEvent("beforerequestdevice");
    try {
      this.device = Capacitor.isNativePlatform()
        ? await this.requestDeviceNative(namePrefixes, signal)
        : await this.requestDeviceWeb(namePrefixes);
      if (!this.device) {
        this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
        throw new DeviceError({
          code: "no-device-selected",
          message: "No device selected",
        });
      }
      return this.device;
    } finally {
      this.dispatchEvent("afterrequestdevice");
    }
  }

  async getAccelerometerData(): Promise<AccelerometerData> {
    assertConnected(this.connection);
    return this.connection.accelerometer.getData();
  }

  async getAccelerometerPeriod(): Promise<number> {
    assertConnected(this.connection);
    return this.connection.accelerometer.getPeriod();
  }

  async setAccelerometerPeriod(value: number): Promise<void> {
    assertConnected(this.connection);
    return this.connection.accelerometer.setPeriod(value);
  }

  async setLedText(text: string): Promise<void> {
    assertConnected(this.connection);
    return this.connection.led.setText(text);
  }

  async getLedScrollingDelay(): Promise<number> {
    assertConnected(this.connection);
    return this.connection.led.getScrollingDelay();
  }

  async setLedScrollingDelay(delayInMillis: number): Promise<void> {
    assertConnected(this.connection);
    await this.connection.led.setScrollingDelay(delayInMillis);
  }

  async getLedMatrix(): Promise<LedMatrix> {
    assertConnected(this.connection);
    return await this.connection.led.getLedMatrix();
  }

  async setLedMatrix(matrix: LedMatrix): Promise<void> {
    assertConnected(this.connection);
    await this.connection.led.setLedMatrix(matrix);
  }

  async getMagnetometerData(): Promise<MagnetometerData> {
    assertConnected(this.connection);
    return this.connection.magnetometer.getData();
  }

  async getMagnetometerPeriod(): Promise<number> {
    assertConnected(this.connection);
    return this.connection.magnetometer.getPeriod();
  }

  async setMagnetometerPeriod(value: number): Promise<void> {
    assertConnected(this.connection);
    return this.connection.magnetometer.setPeriod(value);
  }

  async getMagnetometerBearing(): Promise<number> {
    assertConnected(this.connection);
    return this.connection.magnetometer.getBearing();
  }

  async triggerMagnetometerCalibration(): Promise<void> {
    assertConnected(this.connection);
    await this.connection.magnetometer.triggerCalibration();
  }

  async uartWrite(data: Uint8Array): Promise<void> {
    assertConnected(this.connection);
    await this.connection.uart.writeData(data);
  }

  /**
   * Flash the micro:bit.
   *
   * Always leaves the connection in {@link ConnectionStatus.DISCONNECTED} state.
   * Bluetooth connects directly to the application processor, which reboots
   * after flashing, so the connection is necessarily lost. Call {@link connect}
   * again after flashing to reconnect.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   */
  async flash(
    dataSource: FlashDataSource,
    options: FlashOptions = {},
  ): Promise<void> {
    const progress: ProgressCallback = options.progress ?? (() => {});
    try {
      // We'll disconnect/reconnect multiple times due to device resets, but reporting this is unhelpful.
      this.deferredUpdatesPreviousStatus = this.status;

      if (this.status !== ConnectionStatus.CONNECTED) {
        await this.connect({ progress, signal: options.signal });
      }

      const connection = this.connection!;
      try {
        const boardVersion = connection.boardVersion;
        if (!boardVersion) {
          throw new DeviceError({
            code: "device-disconnected",
            message: "No board version found",
          });
        }
        const memoryMap = convertDataToMemoryMap(
          await dataSource(boardVersion),
        );
        if (!memoryMap) {
          throw new FlashDataError("Could not convert hex to memory map");
        }

        if (!this.device) {
          throw new DeviceError({
            code: "device-disconnected",
            message: "No device",
          });
        }
        this.log(`Got board version ${boardVersion}`);

        const partialFlashResult = await partialFlash(
          connection,
          boardVersion,
          memoryMap,
          progress,
        );

        if (partialFlashResult === PartialFlashResult.AttemptFullFlash) {
          await fullFlash(connection, boardVersion, memoryMap, progress);
        }

        this.dispatchEvent("flash");

        if (
          partialFlashResult === PartialFlashResult.AlreadyUpToDate ||
          partialFlashResult === PartialFlashResult.Success
        ) {
          this.waitForPostFlashDisconnectPromise = (async () => {
            try {
              if (connection.connected) {
                this.log("Wait for post partial flash disconnect...");
                await connection.waitForDisconnect(10_000);
              }
            } catch (e) {
              if (e instanceof TimeoutError) {
                this.log("Wait for post partial flash disconnect timed out.");
              } else {
                this.error(
                  "Error waiting for post partial flash disconnect",
                  e,
                );
              }
            } finally {
              this.waitForPostFlashDisconnectPromise = undefined;
              if (connection.connected) {
                await this.disconnect();
              }
            }
          })();
          this.setStatus(ConnectionStatus.DISCONNECTED);
        }
      } catch (e) {
        this.error("Failed to flash", e);
        throw e;
      } finally {
        if (!this.waitForPostFlashDisconnectPromise) {
          await this.disconnect();
        }
      }
    } finally {
      const previousStatus = this.deferredUpdatesPreviousStatus!;
      this.deferredUpdatesPreviousStatus = undefined;
      this.dispatchEvent("status", {
        status: this.status,
        previousStatus,
      });
    }
  }

  /**
   * Requests a device via the browser's Bluetooth device chooser.
   *
   * @returns device or undefined if user cancels.
   */
  private async requestDeviceWeb(
    namePrefixes: string[],
  ): Promise<BleDevice | undefined> {
    const optionalServices = [
      profile.accelerometer.id,
      profile.button.id,
      profile.deviceInformation.id,
      profile.dfuControl.id,
      profile.event.id,
      profile.ioPin.id,
      profile.led.id,
      profile.magnetometer.id,
      profile.temperature.id,
      profile.uart.id,
    ];
    // Temporarily patch navigator.bluetooth.requestDevice to support multiple
    // name prefix filters. The capacitor-ble plugin only supports a single
    // namePrefix, but the Web Bluetooth API supports a filters array.
    // By patching at this level the plugin's internal deviceMap is populated
    // naturally when its own requestDevice completes.
    const orig = navigator.bluetooth.requestDevice.bind(navigator.bluetooth);
    try {
      navigator.bluetooth.requestDevice = (options?: RequestDeviceOptions) =>
        orig({
          ...options,
          filters: namePrefixes.map((namePrefix) => ({ namePrefix })),
        });
      return await BleClient.requestDevice({
        namePrefix: namePrefixes[0],
        optionalServices,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        return undefined;
      }
      throw e;
    } finally {
      navigator.bluetooth.requestDevice = orig;
    }
  }

  /**
   * Finds device with specified name prefix.
   *
   * @returns device or undefined if none can be found.
   * @throws DeviceError with code "aborted" if signal is aborted.
   */
  private async requestDeviceNative(
    namePrefixes: string[],
    signal?: AbortSignal,
  ): Promise<BleDevice | undefined> {
    if (signal?.aborted) {
      throw new DeviceError({ code: "aborted", message: "Connection aborted" });
    }

    const matchesAnyPrefix = (name: string | undefined) =>
      !!name && namePrefixes.some((p) => name.startsWith(p));

    // Check for existing bonded devices.
    const bonded = await this.checkBondedDevices((device: BleDevice) =>
      matchesAnyPrefix(device.name),
    );
    if (bonded) {
      return bonded;
    }
    this.log(`Scanning for device - ${namePrefixes.join(", ")}`);
    let found = false;
    let aborted = false;
    const scanPromise: Promise<BleDevice> = new Promise(
      (resolve) =>
        // This only resolves when we stop the scan.
        void BleClient.requestLEScan({}, async (result) => {
          // For a V1 in the Nordic bootloader, we see a name of "DfuTarg" that
          // isn't matched by the name filter but the advertising name is in the
          // localName on the device. So we filter here instead.  This happens on
          // iOS if DFU fails / is interrupted.
          if (
            matchesAnyPrefix(result.device.name) ||
            matchesAnyPrefix(result.localName)
          ) {
            found = true;
            await BleClient.stopLEScan();
            resolve(result.device);
          }
        }),
    );
    const abortPromise = new Promise<never>((_, reject) => {
      signal?.addEventListener(
        "abort",
        async () => {
          aborted = true;
          await BleClient.stopLEScan();
          this.log("Abort scanning for devices");
          reject(
            new DeviceError({ code: "aborted", message: "Connection aborted" }),
          );
        },
        { once: true },
      );
    });
    const scanTimeoutPromise: Promise<undefined> = new Promise((resolve) =>
      setTimeout(async () => {
        if (!found && !aborted) {
          await BleClient.stopLEScan();
          this.log("Timeout scanning for device");
          resolve(undefined);
        }
      }, scanningTimeoutInMs),
    );
    return await Promise.race([scanPromise, scanTimeoutPromise, abortPromise]);
  }

  private async checkBondedDevices(predicate: (device: BleDevice) => boolean) {
    if (!isAndroid()) {
      // Not supported.
      return undefined;
    }
    const bondedDevices = await BleClient.getBondedDevices();
    const result = bondedDevices.find(predicate);
    this.log(
      result === undefined
        ? "No matching bonded device"
        : "Found matching bonded device",
    );
    return result;
  }
}

const convertDataToMemoryMap = (
  data: string | Uint8Array | MemoryMap,
): MemoryMap => {
  if (data instanceof MemoryMap) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return MemoryMap.fromPaddedUint8Array(data);
  }
  return MemoryMap.fromHex(truncateHexAfterEof(data));
};
