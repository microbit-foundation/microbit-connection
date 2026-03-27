/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BleClient, BleDevice } from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import MemoryMap from "nrf-intel-hex";
import {
  BackgroundErrorData,
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  ConnectionStatusChange,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  FlashDataSource,
  FlashOptions,
  ProgressCallback,
  ProgressStage,
  assertConnected,
} from "../device.js";
import { TypedEventTarget } from "../events.js";
import { ConsoleLogging, Logging } from "../logging.js";
import {
  AccelerometerData,
  ButtonActionData,
  ButtonData,
  GestureData,
  LedMatrix,
  MagnetometerData,
  MicrobitEventData,
  PinData,
  PinValue,
  ServiceConnectionEventMap,
  TemperatureData,
  TypedServiceEvent,
  UartData,
} from "../service-events.js";
import {
  BluetoothDeviceWrapper,
  isAndroid,
  scanningTimeoutInMs,
} from "./device-wrapper.js";
import { fullFlash } from "./flashing/flashing-full.js";
import partialFlash, {
  PartialFlashResult,
} from "./flashing/flashing-partial.js";
import { profile } from "./profile.js";

import { TimeoutError } from "../async-util.js";
import { throwIfUnavailable } from "../availability.js";
import { truncateHexAfterEof } from "../hex-util.js";
import { withBleErrorMapping } from "./ble-error.js";
import {
  DefaultDeviceBondState,
  DeviceBondState,
} from "./device-bond-state.js";

type BleClientError = { message: string; errorMessage: string };

let bleClientInitialized = false;

export interface MicrobitBluetoothConnectionOptions {
  logging?: Logging;
  deviceBondState?: DeviceBondState;
}

/**
 * A Bluetooth connection to a micro:bit device.
 *
 * Events and methods rely on specific BLE services being present in the
 * micro:bit's firmware. Which services are available depends on the firmware
 * build for C++ and for a MakeCode program depends on the service blocks added
 * from the Bluetooth extension.
 *
 * The table below maps each event and method to the BLE service it requires.
 * If a service is not present, the event will silently not fire (no error is
 * raised) and methods that depend on it will throw.
 *
 * ### Accelerometer Service
 * - `accelerometerdatachanged` event
 * - {@link getAccelerometerData}, {@link getAccelerometerPeriod}, {@link setAccelerometerPeriod}
 *
 * ### Button Service
 * - `buttonachanged`, `buttonbchanged` events
 *
 * ### Event Service
 * - `gesturechanged` event — also requires the accelerometer hardware to be
 *   active; this happens automatically if the Accelerometer Service is present
 * - `buttonaaction`, `buttonbaction`, `buttonabaction` events
 * - `logoaction` event (V2 only)
 * - `microbitevent` event
 * - {@link subscribeToEvent}, {@link sendEvent}
 *
 * ### IO Pin Service
 * - `pinchanged` event
 * - {@link getAnalogPins}, {@link setAnalogPins}
 * - {@link getInputPins}, {@link setInputPins}
 * - {@link readPins}, {@link writePins}, {@link writePinPwm}
 *
 * ### LED Service
 * - {@link setLedText}, {@link getLedScrollingDelay}, {@link setLedScrollingDelay}
 * - {@link getLedMatrix}, {@link setLedMatrix}
 *
 * ### Magnetometer Service
 * - `magnetometerdatachanged` event
 * - {@link getMagnetometerData}, {@link getMagnetometerBearing}
 * - {@link getMagnetometerPeriod}, {@link setMagnetometerPeriod}
 * - {@link triggerMagnetometerCalibration}
 *
 * ### Temperature Service
 * - `temperaturechanged` event
 * - {@link getTemperature}, {@link getTemperaturePeriod}, {@link setTemperaturePeriod}
 *
 * ### UART Service
 * - `uartdata` event
 * - {@link uartWrite}
 */
export interface MicrobitBluetoothConnection extends DeviceConnection {
  readonly type: "bluetooth";
  // -- DeviceConnectionEventMap overloads (redeclared from base) --
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
  // -- ServiceConnectionEventMap overloads --
  /** Requires: Accelerometer Service. */
  addEventListener(
    type: "accelerometerdatachanged",
    listener: (data: AccelerometerData) => void,
  ): void;
  /** Requires: Button Service. */
  addEventListener(
    type: "buttonachanged" | "buttonbchanged",
    listener: (data: ButtonData) => void,
  ): void;
  /** Requires: Magnetometer Service. */
  addEventListener(
    type: "magnetometerdatachanged",
    listener: (data: MagnetometerData) => void,
  ): void;
  /** Requires: Temperature Service. */
  addEventListener(
    type: "temperaturechanged",
    listener: (data: TemperatureData) => void,
  ): void;
  /** Requires: IO Pin Service. */
  addEventListener(type: "pinchanged", listener: (data: PinData) => void): void;
  /** Requires: Event Service. The accelerometer hardware must also be active (automatic if the Accelerometer Service is present). */
  addEventListener(
    type: "gesturechanged",
    listener: (data: GestureData) => void,
  ): void;
  /** Requires: Event Service. */
  addEventListener(
    type: "buttonaaction" | "buttonbaction" | "buttonabaction",
    listener: (data: ButtonActionData) => void,
  ): void;
  /** Requires: Event Service. V2 only. */
  addEventListener(
    type: "logoaction",
    listener: (data: ButtonActionData) => void,
  ): void;
  /**
   * Requires: Event Service. Receives raw micro:bit message bus events
   * registered via {@link subscribeToEvent}. Higher-level events supported
   * by the event service, like `gesturechanged` and button actions, are not
   * included here unless you subscribe to them using {@link subscribeToEvent}.
   */
  addEventListener(
    type: "microbitevent",
    listener: (data: MicrobitEventData) => void,
  ): void;
  /** Requires: UART Service. */
  addEventListener(type: "uartdata", listener: (data: UartData) => void): void;

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
  removeEventListener(
    type: "accelerometerdatachanged",
    listener: (data: AccelerometerData) => void,
  ): void;
  removeEventListener(
    type: "buttonachanged" | "buttonbchanged",
    listener: (data: ButtonData) => void,
  ): void;
  removeEventListener(
    type: "magnetometerdatachanged",
    listener: (data: MagnetometerData) => void,
  ): void;
  removeEventListener(
    type: "temperaturechanged",
    listener: (data: TemperatureData) => void,
  ): void;
  removeEventListener(
    type: "pinchanged",
    listener: (data: PinData) => void,
  ): void;
  removeEventListener(
    type: "gesturechanged",
    listener: (data: GestureData) => void,
  ): void;
  removeEventListener(
    type: "buttonaaction" | "buttonbaction" | "buttonabaction",
    listener: (data: ButtonActionData) => void,
  ): void;
  removeEventListener(
    type: "logoaction",
    listener: (data: ButtonActionData) => void,
  ): void;
  removeEventListener(
    type: "microbitevent",
    listener: (data: MicrobitEventData) => void,
  ): void;
  removeEventListener(
    type: "uartdata",
    listener: (data: UartData) => void,
  ): void;

  /**
   * Sets micro:bit name filter for device requesting.
   *
   * @param name The name of the micro:bit.
   */
  setNameFilter(name: string): void;

  /**
   * Gets micro:bit accelerometer data.
   *
   * Requires: Accelerometer Service.
   *
   * @returns accelerometer data.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getAccelerometerData(): Promise<AccelerometerData>;

  /**
   * Gets micro:bit accelerometer period.
   *
   * Requires: Accelerometer Service.
   *
   * @returns accelerometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getAccelerometerPeriod(): Promise<number>;

  /**
   * Sets micro:bit accelerometer period.
   *
   * Requires: Accelerometer Service.
   *
   * @param value The accelerometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setAccelerometerPeriod(value: number): Promise<void>;

  /**
   * Sets micro:bit LED text.
   *
   * Requires: LED Service.
   *
   * @param text The text displayed on micro:bit LED.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedText(text: string): Promise<void>;

  /**
   * Gets micro:bit LED scrolling delay.
   *
   * Requires: LED Service.
   *
   * @returns LED scrolling delay in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getLedScrollingDelay(): Promise<number>;

  /**
   * Sets micro:bit LED scrolling delay.
   *
   * Requires: LED Service.
   *
   * @param delayInMillis LED scrolling delay in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedScrollingDelay(delayInMillis: number): Promise<void>;

  /**
   * Gets micro:bit LED matrix.
   *
   * Requires: LED Service.
   *
   * @returns a boolean matrix representing the micro:bit LED display.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getLedMatrix(): Promise<LedMatrix>;

  /**
   * Sets micro:bit LED matrix.
   *
   * Requires: LED Service.
   *
   * @param matrix an boolean matrix representing the micro:bit LED display.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setLedMatrix(matrix: LedMatrix): Promise<void>;

  /**
   * Gets micro:bit magnetometer data.
   *
   * Requires: Magnetometer Service.
   *
   * @returns magnetometer data.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerData(): Promise<MagnetometerData>;

  /**
   * Gets micro:bit magnetometer bearing.
   *
   * Requires: Magnetometer Service.
   *
   * @returns magnetometer bearing.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerBearing(): Promise<number>;

  /**
   * Gets micro:bit magnetometer period.
   *
   * Requires: Magnetometer Service.
   *
   * @returns magnetometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getMagnetometerPeriod(): Promise<number>;

  /**
   * Sets micro:bit magnetometer period.
   *
   * Requires: Magnetometer Service.
   *
   * @param value magnetometer period.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setMagnetometerPeriod(value: number): Promise<void>;

  /**
   * Triggers micro:bit magnetometer calibration.
   *
   * Requires: Magnetometer Service.
   *
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  triggerMagnetometerCalibration(): Promise<void>;

  /**
   * Gets the micro:bit temperature in degrees Celsius.
   *
   * Requires: Temperature Service.
   *
   * @returns temperature in degrees Celsius.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getTemperature(): Promise<number>;

  /**
   * Gets the micro:bit temperature sensor period.
   *
   * Requires: Temperature Service.
   *
   * @returns temperature period in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getTemperaturePeriod(): Promise<number>;

  /**
   * Sets the micro:bit temperature sensor period.
   *
   * Requires: Temperature Service.
   *
   * @param value period in milliseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setTemperaturePeriod(value: number): Promise<void>;

  /**
   * Gets which pins are configured as analog.
   * All other pins are digital (the default).
   *
   * Requires: IO Pin Service.
   *
   * @returns array of pin numbers (0-18) configured as analog.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getAnalogPins(): Promise<number[]>;

  /**
   * Sets which pins are configured as analog.
   * All other pins become digital (the default).
   *
   * Requires: IO Pin Service.
   *
   * @param pins array of pin numbers (0-18) to configure as analog.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setAnalogPins(pins: number[]): Promise<void>;

  /**
   * Gets which pins are configured as inputs.
   * Input pins are monitored and their values reported via notifications.
   * All other pins are outputs (the default).
   *
   * Requires: IO Pin Service.
   *
   * @returns array of pin numbers (0-18) configured as inputs.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  getInputPins(): Promise<number[]>;

  /**
   * Sets which pins are configured as inputs.
   * Input pins are monitored and their values reported via notifications.
   * All other pins become outputs (the default).
   *
   * Note: configuring a pin as input overrides any existing pin mode
   * (e.g. touch sensing used by MakeCode "on pin pressed" blocks).
   * The two cannot be used on the same pin simultaneously.
   *
   * Requires: IO Pin Service.
   *
   * @param pins array of pin numbers (0-18) to configure as inputs.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  setInputPins(pins: number[]): Promise<void>;

  /**
   * Reads current values of input pins. Unlike the `pinchanged` event
   * (which only includes pins whose values changed), this returns every
   * pin configured as an input, up to a firmware limit of 10 pins
   * (lowest-numbered first).
   *
   * Requires: IO Pin Service.
   *
   * @returns array of pin/value pairs.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  readPins(): Promise<PinValue[]>;

  /**
   * Writes pin data for output pins.
   *
   * Requires: IO Pin Service.
   *
   * @param data array of pin/value pairs.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  writePins(data: PinValue[]): Promise<void>;

  /**
   * Sets PWM output on a pin.
   *
   * Requires: IO Pin Service.
   *
   * @param pin Pin number (0-18).
   * @param options PWM configuration.
   * @param options.value Analog value (0-1024).
   * @param options.period Period in microseconds.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  writePinPwm(
    pin: number,
    options: { value: number; period: number },
  ): Promise<void>;

  /**
   * Register interest in a specific micro:bit message bus event.
   * Tells the micro:bit to forward matching message bus traffic over BLE.
   * Matching events are dispatched as `microbitevent`.
   * Use 0 as the value to match all events from a source.
   *
   * For common message bus events, consider the higher-level alternatives:
   * `gesturechanged`, `buttonaaction`, `buttonbaction`, `buttonabaction`.
   *
   * Requires: Event Service.
   *
   * @param source Event source ID.
   * @param value Event value to match, or 0 for any.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  subscribeToEvent(source: number, value: number): Promise<void>;

  /**
   * Send an event to the micro:bit's message bus.
   *
   * Requires: Event Service.
   *
   * @param source Event source ID.
   * @param value Event value.
   * @throws {DeviceError} with code `not-connected` if there is no connection.
   */
  sendEvent(source: number, value: number): Promise<void>;

  /**
   * Write UART messages.
   *
   * Requires: UART Service.
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
  readonly type = "bluetooth" as const;
  status: ConnectionStatus = ConnectionStatus.NoAuthorizedDevice;

  /**
   * The BLE device we last connected to.
   * Cleared if it is disconnected.
   */
  private bleDevice: BleDevice | undefined;

  private logging: Logging;
  private deviceBondState: DeviceBondState;
  /**
   * Device-specific state. Created on connect, cleared on disconnect.
   */
  private device: BluetoothDeviceWrapper | undefined;

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
    this.device?.startNotifications(type as TypedServiceEvent);
  }

  protected eventDeactivated(type: string): void {
    this.device?.stopNotifications(type as TypedServiceEvent);
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

    if (!this.bleDevice || !this.device) {
      progress(ProgressStage.FindingDevice);
      const device = await this.requestDevice(options?.signal);
      this.device = new BluetoothDeviceWrapper(
        device,
        this.logging,
        this.deviceBondState,
        this.dispatchEvent.bind(this),
        () => this.getActiveEvents() as Array<keyof ServiceConnectionEventMap>,
        {
          onConnecting: () => this.setStatus(ConnectionStatus.Connecting),
          onSuccess: () => {
            this.cachedBoardVersion = this.device!.boardVersion;
            this.setStatus(ConnectionStatus.Connected);
          },
          onDisconnect: () => this.setStatus(ConnectionStatus.Disconnected),
        },
      );
    }

    await this.device.connect(options);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.device) {
        await this.device.disconnect();
      }
    } catch (e) {
      this.logging.event({
        type: "Bluetooth-error",
        message: "error-disconnecting",
      });
    } finally {
      this.setStatus(ConnectionStatus.Disconnected);
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
    this.bleDevice = undefined;
    this.cachedBoardVersion = undefined;
    this.setStatus(ConnectionStatus.NoAuthorizedDevice);
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
    if (this.bleDevice) {
      if (namePrefixes.some((p) => this.bleDevice!.name?.startsWith(p))) {
        return this.bleDevice;
      }
      this.log(
        `Cached device "${this.bleDevice.name}" doesn't match filters "${namePrefixes.join(", ")}", clearing`,
      );
      await this.clearDevice();
    }

    this.dispatchEvent("beforerequestdevice");
    try {
      this.bleDevice = Capacitor.isNativePlatform()
        ? await this.requestDeviceNative(namePrefixes, signal)
        : await this.requestDeviceWeb(namePrefixes);
      if (!this.bleDevice) {
        this.setStatus(ConnectionStatus.NoAuthorizedDevice);
        throw new DeviceError({
          code: "no-device-selected",
          message: "No device selected",
        });
      }
      return this.bleDevice;
    } finally {
      this.dispatchEvent("afterrequestdevice");
    }
  }

  async getAccelerometerData(): Promise<AccelerometerData> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.accelerometer.getData());
  }

  async getAccelerometerPeriod(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.accelerometer.getPeriod());
  }

  async setAccelerometerPeriod(value: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.accelerometer.setPeriod(value),
    );
  }

  async setLedText(text: string): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.led.setText(text));
  }

  async getLedScrollingDelay(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.led.getScrollingDelay());
  }

  async setLedScrollingDelay(delayInMillis: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.led.setScrollingDelay(delayInMillis),
    );
  }

  async getLedMatrix(): Promise<LedMatrix> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.led.getLedMatrix());
  }

  async setLedMatrix(matrix: LedMatrix): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.led.setLedMatrix(matrix));
  }

  async getMagnetometerData(): Promise<MagnetometerData> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.magnetometer.getData());
  }

  async getMagnetometerPeriod(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.magnetometer.getPeriod());
  }

  async setMagnetometerPeriod(value: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.magnetometer.setPeriod(value),
    );
  }

  async getMagnetometerBearing(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.magnetometer.getBearing());
  }

  async triggerMagnetometerCalibration(): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.magnetometer.triggerCalibration(),
    );
  }

  async getTemperature(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.temperature.getData());
  }

  async getTemperaturePeriod(): Promise<number> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.temperature.getPeriod());
  }

  async setTemperaturePeriod(value: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.temperature.setPeriod(value));
  }

  async getAnalogPins(): Promise<number[]> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.getAnalogPins());
  }

  async setAnalogPins(pins: number[]): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.setAnalogPins(pins));
  }

  async getInputPins(): Promise<number[]> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.getInputPins());
  }

  async setInputPins(pins: number[]): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.setInputPins(pins));
  }

  async readPins(): Promise<PinValue[]> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.readPins());
  }

  async writePins(data: PinValue[]): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.ioPin.writePins(data));
  }

  async writePinPwm(
    pin: number,
    options: { value: number; period: number },
  ): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.ioPin.setPwm(pin, options.value, options.period),
    );
  }

  async subscribeToEvent(source: number, value: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.events.subscribeToEvent(source, value),
    );
  }

  async sendEvent(source: number, value: number): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() =>
      this.device!.events.sendEvent(source, value),
    );
  }

  async uartWrite(data: Uint8Array): Promise<void> {
    assertConnected(this.device);
    return withBleErrorMapping(() => this.device!.uart.writeData(data));
  }

  /**
   * Flash the micro:bit.
   *
   * Always leaves the connection in {@link ConnectionStatus.Disconnected} state.
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

      if (this.status !== ConnectionStatus.Connected) {
        await this.connect({ progress, signal: options.signal });
      }

      const connection = this.device!;
      try {
        const boardVersion = connection.boardVersion;
        if (!boardVersion) {
          throw new DeviceError({
            code: "connection-error",
            message: "No board version found",
          });
        }
        const memoryMap = convertDataToMemoryMap(
          await dataSource(boardVersion),
        );
        if (!memoryMap) {
          throw new FlashDataError("Could not convert hex to memory map");
        }

        if (!this.bleDevice) {
          throw new DeviceError({
            code: "connection-error",
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
          this.setStatus(ConnectionStatus.Disconnected);
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
