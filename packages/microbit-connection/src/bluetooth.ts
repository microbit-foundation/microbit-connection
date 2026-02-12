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
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
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
import { truncateHexAfterEof } from "./hex-flash-data-source.js";
import {
  DefaultDeviceBondState,
  DeviceBondState,
} from "./device-bond-state.js";
import { TimeoutError } from "./async-util.js";

type BleClientError = { message: string; errorMessage: string };

let bleClientInitialized = false;

export interface MicrobitWebBluetoothConnectionOptions {
  logging?: Logging;
  deviceBondState?: DeviceBondState;
}

export interface MicrobitWebBluetoothConnection
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
  uartWrite(data: Uint8Array): Promise<void>;

  /**
   * Flash the micro:bit.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   * @throws {DeviceError} On flash failure. The error.code property indicates the failure type.
   * @throws {FlashDataError} If data preparation fails.
   */
  flash(dataSource: FlashDataSource, options: FlashOptions): Promise<void>;
}

/**
 * A Bluetooth connection factory.
 */
export const createWebBluetoothConnection = (
  options?: MicrobitWebBluetoothConnectionOptions,
): MicrobitWebBluetoothConnection =>
  new MicrobitWebBluetoothConnectionImpl(options);

/**
 * A Bluetooth connection to a micro:bit device.
 */
class MicrobitWebBluetoothConnectionImpl
  extends TypedEventTarget<DeviceConnectionEventMap & ServiceConnectionEventMap>
  implements MicrobitWebBluetoothConnection
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

  private nameFilter: string | undefined;
  private deferredUpdatesPreviousStatus: ConnectionStatus | undefined;
  private waitForPostFlashDisconnectPromise: Promise<void> | undefined;

  constructor(options: MicrobitWebBluetoothConnectionOptions = {}) {
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

  getBoardVersion(): BoardVersion | undefined {
    return this.connection?.boardVersion;
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
        this.dispatchTypedEvent.bind(this),
        () => this.getActiveEvents() as Array<keyof ServiceConnectionEventMap>,
        {
          onConnecting: () => this.setStatus(ConnectionStatus.CONNECTING),
          onSuccess: () => this.setStatus(ConnectionStatus.CONNECTED),
          onDisconnect: () => this.setStatus(ConnectionStatus.DISCONNECTED),
        },
      );
    }

    await this.connection.connect(options);
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
      this.dispatchTypedEvent(
        "status",
        new ConnectionStatusEvent(newStatus, previousStatus),
      );
    }
  }

  serialWrite(data: string): Promise<void> {
    if (this.connection) {
      // TODO
    }
    return Promise.resolve();
  }

  async clearDevice(): Promise<void> {
    await this.disconnect();
    this.device = undefined;
    this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
  }

  setNameFilter(name: string) {
    this.nameFilter = name;
  }

  private async requestDevice(signal?: AbortSignal): Promise<BleDevice> {
    // TODO: is this possible to reinstate?
    // See https://github.com/bsiever/microbit-pxt-blehid/issues/31
    // namePrefix: this.nameFilter
    //   ? `uBit [${this.nameFilter}]`
    //   : "uBit",
    const namePrefix = this.nameFilter
      ? `BBC micro:bit [${this.nameFilter}]`
      : "BBC micro:bit";

    // If we have a cached device, check if it still matches the current filter.
    // If not, clear it so we find a new device.
    if (this.device) {
      if (this.device.name?.startsWith(namePrefix)) {
        return this.device;
      }
      this.log(
        `Cached device "${this.device.name}" doesn't match filter "${namePrefix}", clearing`,
      );
      await this.clearDevice();
    }

    this.dispatchTypedEvent("beforerequestdevice", new BeforeRequestDevice());
    try {
      this.device = Capacitor.isNativePlatform()
        ? await this.requestDeviceNative(namePrefix, signal)
        : await this.requestDeviceWeb(namePrefix);
      if (!this.device) {
        this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
        throw new DeviceError({
          code: "no-device-selected",
          message: "No device selected",
        });
      }
      return this.device;
    } finally {
      this.dispatchTypedEvent("afterrequestdevice", new AfterRequestDevice());
    }
  }

  async getAccelerometerData(): Promise<AccelerometerData | undefined> {
    return this.connection?.accelerometer.getData();
  }

  async getAccelerometerPeriod(): Promise<number | undefined> {
    return this.connection?.accelerometer.getPeriod();
  }

  async setAccelerometerPeriod(value: number): Promise<void> {
    return this.connection?.accelerometer.setPeriod(value);
  }

  async setLedText(text: string): Promise<void> {
    return this.connection?.led.setText(text);
  }

  async getLedScrollingDelay(): Promise<number | undefined> {
    return this.connection?.led.getScrollingDelay();
  }

  async setLedScrollingDelay(delayInMillis: number): Promise<void> {
    await this.connection?.led.setScrollingDelay(delayInMillis);
  }

  async getLedMatrix(): Promise<LedMatrix | undefined> {
    return await this.connection?.led.getLedMatrix();
  }

  async setLedMatrix(matrix: LedMatrix): Promise<void> {
    await this.connection?.led.setLedMatrix(matrix);
  }

  async getMagnetometerData(): Promise<MagnetometerData | undefined> {
    return this.connection?.magnetometer.getData();
  }

  async getMagnetometerPeriod(): Promise<number | undefined> {
    return this.connection?.magnetometer.getPeriod();
  }

  async setMagnetometerPeriod(value: number): Promise<void> {
    return this.connection?.magnetometer.setPeriod(value);
  }

  async getMagnetometerBearing(): Promise<number | undefined> {
    return this.connection?.magnetometer.getBearing();
  }

  async triggerMagnetometerCalibration(): Promise<void> {
    await this.connection?.magnetometer.triggerCalibration();
  }

  async uartWrite(data: Uint8Array): Promise<void> {
    await this.connection?.uart.writeData(data);
  }

  /**
   * Flash the micro:bit.
   *
   * Note that this will always leave the connection disconnected.
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
        } else if (partialFlashResult === PartialFlashResult.Success) {
          this.waitForPostFlashDisconnectPromise = (async () => {
            try {
              if (connection.connected) {
                this.log("Wait for post partial flash disconnect...");
                await connection.waitForDisconnect(10_000);
              }
            } catch (e) {
              if (e instanceof TimeoutError) {
                this.log("Wait for post partial flash disconnect timed out.");
                return;
              }
              throw e;
            } finally {
              this.waitForPostFlashDisconnectPromise = undefined;
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
      this.dispatchTypedEvent(
        "status",
        new ConnectionStatusEvent(this.status, previousStatus),
      );
    }
  }

  /**
   * Requests a device via the browser's Bluetooth device chooser.
   *
   * @returns device or undefined if user cancels.
   */
  private async requestDeviceWeb(
    namePrefix: string,
  ): Promise<BleDevice | undefined> {
    try {
      return await BleClient.requestDevice({
        namePrefix,
        optionalServices: [
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
        ],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        return undefined;
      }
      throw e;
    }
  }

  /**
   * Finds device with specified name prefix.
   *
   * @returns device or undefined if none can be found.
   * @throws DeviceError with code "aborted" if signal is aborted.
   */
  private async requestDeviceNative(
    namePrefix: string,
    signal?: AbortSignal,
  ): Promise<BleDevice | undefined> {
    if (signal?.aborted) {
      throw new DeviceError({ code: "aborted", message: "Connection aborted" });
    }

    // Check for existing bonded devices.
    const bonded = await this.checkBondedDevices((device: BleDevice) => {
      const name = device.name;
      return !!name && name.startsWith(namePrefix);
    });
    if (bonded) {
      return bonded;
    }
    this.log(`Scanning for device - ${namePrefix}`);
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
            result.device.name?.startsWith(namePrefix) ||
            result.localName?.startsWith(namePrefix)
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
