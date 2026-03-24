/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import {
  BleClient,
  BleDevice,
  TimeoutOptions,
} from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import { AccelerometerService } from "./services/accelerometer-service.js";
import {
  DisconnectError,
  disconnectErrorCallback,
  TimeoutError,
  timeoutErrorAfter,
} from "../async-util.js";
import { ButtonService } from "./services/button-service.js";
import { DeviceInformationService } from "./services/device-information-service.js";
import {
  BondMode,
  BoardVersion,
  ConnectOptions,
  DeviceError,
  ProgressCallback,
  ProgressStage,
} from "../device.js";
import { LedService } from "./services/led-service.js";
import { Logging, LoggingEvent, ConsoleLogging } from "../logging.js";
import { MagnetometerService } from "./services/magnetometer-service.js";
import {
  MicroBitMode,
  PartialFlashingService,
} from "./services/partial-flashing-service.js";
import {
  ServiceConnectionEventMap,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../service-events.js";
import { UARTService } from "./services/uart-service.js";
import {
  DefaultDeviceBondState,
  DeviceBondState,
} from "./device-bond-state.js";
import { profile } from "./profile.js";

/**
 * The @capacitor-community/bluetooth-le plugin throws this message when
 * a characteristic UUID is not found in the device's GATT table.
 */
export const isCharacteristicNotFoundError = (e: unknown): boolean =>
  e instanceof Error && e.message === "Characteristic not found.";

export const bondingTimeoutInMs = 40_000;
export const connectTimeoutInMs = 10_000;
export const scanningTimeoutInMs = 10_000;

export const isAndroid = () => Capacitor.getPlatform() === "android";

export interface Service {
  readonly uuid: string;
  getRelevantEvents(): TypedServiceEvent[];
  startNotifications(type: TypedServiceEvent): Promise<void>;
  stopNotifications(type: TypedServiceEvent): Promise<void>;
}

interface ConnectCallbacks {
  onConnecting: () => void;
  onDisconnect: () => void;
  onSuccess: () => void;
}

// TODO: We've removed the support for these behaviours as we need to
// re-evaluate how best to support then via capacitor-ble (or reinstate
// the direct Web Bluetooth connection code.
//
// On ChromeOS and Mac there's no timeout and no clear way to abort
// device.gatt.connect(), so we accept that sometimes we'll still
// be trying to connect when we'd rather not be. If it succeeds when
// we no longer intend to be connected then we disconnect at that
// point. If we try to connect when a previous connection attempt is
// still around then we wait for it for our timeout period.
//
// On Windows it times out after 7s.
// https://bugs.chromium.org/p/chromium/issues/detail?id=684073
//
// Additionally we've remove the delay before trying to connect again
// on Windows.
//
// We also used to have a timeout around requestDevice that reloaded the page.
//
// > In some situations the Chrome device prompt simply doesn't appear so we time
// > this out after 30 seconds and reload the page

export class BluetoothDeviceWrapper implements Logging {
  connected = false;

  // Only updated after the full connection flow completes not during bond handling.
  private serviceIds: Set<string> = new Set();

  accelerometer: AccelerometerService;
  buttons: ButtonService;
  deviceInformation: DeviceInformationService;
  led: LedService;
  magnetometer: MagnetometerService;
  uart: UARTService;

  /**
   * Only defined after connection.
   */
  boardVersion: BoardVersion | undefined;

  private services: Service[];

  private waitingForDisconnectEventCallbacks: Array<() => void> = [];
  private internalNotificationListeners = new Map<
    string,
    Set<(data: Uint8Array) => void>
  >();

  constructor(
    public readonly bleDevice: BleDevice,
    private logging: Logging = new ConsoleLogging(),
    private deviceBondState: DeviceBondState = new DefaultDeviceBondState(),
    dispatchTypedEvent: TypedServiceEventDispatcher,
    private currentEvents: () => Array<keyof ServiceConnectionEventMap>,
    private callbacks: ConnectCallbacks,
  ) {
    this.accelerometer = new AccelerometerService(
      bleDevice.deviceId,
      dispatchTypedEvent,
    );
    this.buttons = new ButtonService(bleDevice.deviceId, dispatchTypedEvent);
    this.deviceInformation = new DeviceInformationService(bleDevice.deviceId);
    this.led = new LedService(bleDevice.deviceId);
    this.magnetometer = new MagnetometerService(
      bleDevice.deviceId,
      dispatchTypedEvent,
    );
    this.uart = new UARTService(bleDevice.deviceId, dispatchTypedEvent);
    this.services = [
      this.accelerometer,
      this.buttons,
      this.led,
      this.magnetometer,
      this.uart,
    ];
  }

  setBonded(isBonded: boolean) {
    this.deviceBondState.setBonded(this.bleDevice.deviceId, isBonded);
  }

  async connect(options?: ConnectOptions): Promise<void> {
    const progress = options?.progress ?? (() => {});
    this.logging.event({
      type: "Connect",
      message: "Bluetooth connect start",
    });
    this.callbacks.onConnecting();

    const bondMode: BondMode = options?.bondMode ?? "application";
    try {
      if (Capacitor.isNativePlatform() && bondMode !== "none") {
        const isBonded = this.deviceBondState.isBonded(this.bleDevice.deviceId);
        await this.connectHandlingBond(progress, isBonded ?? false, bondMode);
        this.setBonded(true);
        // We need this on Android for reconnecting after DFU.
        await BleClient.discoverServices(this.bleDevice.deviceId);
      } else {
        progress(ProgressStage.Connecting);
        await this.connectInternal();
      }
      await this.getBoardVersion();

      const events = this.currentEvents();
      const services = await BleClient.getServices(this.bleDevice.deviceId);
      this.serviceIds = new Set(services.map((s) => s.uuid));
      this.logging.log(`Starting notifications for current events ${events}`);
      events.forEach((e) => this.startNotifications(e as TypedServiceEvent));

      this.logging.event({
        type: "Connect",
        message: "Bluetooth connect success",
      });
      this.callbacks.onSuccess();
    } catch (e) {
      this.logging.error("Bluetooth connect error", e);
      this.logging.event({
        type: "Connect",
        message: "Bluetooth connect failed",
      });
      await this.disconnectInternal(false);
      this.callbacks.onDisconnect();

      if (e instanceof DeviceError) {
        throw e;
      }
      this.setBonded(false);
      if (
        // Error thrown in iOS only.
        e instanceof Error &&
        e.message === "Peer removed pairing information"
      ) {
        throw new DeviceError({
          code: "pairing-information-lost",
          message: e.message,
          cause: e,
        });
      }
      throw new DeviceError({
        code: "connection-error",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  private async connectInternal() {
    this.waitingForDisconnectEventCallbacks.length = 0;
    await BleClient.connect(
      this.bleDevice.deviceId,
      this.handleDisconnectEvent,
      {
        timeout: connectTimeoutInMs,
      },
    );
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    return this.disconnectInternal(true);
  }

  private async disconnectInternal(userTriggered: boolean): Promise<void> {
    this.logging.log(
      `Bluetooth disconnect ${userTriggered ? "(user triggered)" : "(programmatic)"}`,
    );
    try {
      if (this.connected) {
        await BleClient.disconnect(this.bleDevice.deviceId);
      }
    } catch (e) {
      this.logging.error("Bluetooth GATT disconnect error (ignored)", e);
      // We might have already lost the connection.
    }
  }

  handleDisconnectEvent = (): void => {
    this.waitingForDisconnectEventCallbacks.forEach((cb) => cb());
    this.waitingForDisconnectEventCallbacks.length = 0;

    this.connected = false;
    this.callbacks.onDisconnect();
  };

  async getBoardVersion(): Promise<BoardVersion> {
    // We read this when we connect and it won't change.
    if (this.boardVersion) {
      return this.boardVersion;
    }
    this.boardVersion = await this.deviceInformation.getBoardVersion();
    return this.boardVersion;
  }

  async startNotifications(type: TypedServiceEvent) {
    await this.getServicesForEvent(type)?.startNotifications(type);
  }

  async stopNotifications(type: TypedServiceEvent) {
    await this.getServicesForEvent(type)?.stopNotifications(type);
  }

  private getServicesForEvent(type: TypedServiceEvent) {
    return this.services.find(
      (s) =>
        this.serviceIds.has(s.uuid) && s.getRelevantEvents().includes(type),
    );
  }

  async startInternalNotifications(
    serviceId: string,
    characteristicId: string,
    options?: TimeoutOptions,
  ): Promise<void> {
    const key = this.getNotificationKey(serviceId, characteristicId);
    await this.raceDisconnectAndTimeout(
      BleClient.startNotifications(
        this.bleDevice.deviceId,
        serviceId,
        characteristicId,
        (value: DataView) => {
          const bytes = new Uint8Array(value.buffer);
          // Notify all registered callbacks.
          this.internalNotificationListeners
            .get(key)
            ?.forEach((cb) => cb(bytes));
        },
        options,
      ),
      { actionName: "start notifications" },
    );
  }

  subscribe(
    serviceId: string,
    characteristicId: string,
    callback: (data: Uint8Array) => void,
  ): void {
    const key = this.getNotificationKey(serviceId, characteristicId);
    if (!this.internalNotificationListeners.has(key)) {
      this.internalNotificationListeners.set(key, new Set());
    }
    this.internalNotificationListeners.get(key)!.add(callback);
  }

  unsubscribe(
    serviceId: string,
    characteristicId: string,
    callback: (data: Uint8Array) => void,
  ): void {
    const key = this.getNotificationKey(serviceId, characteristicId);
    this.internalNotificationListeners.get(key)?.delete(callback);
  }

  async stopInternalNotifications(
    serviceId: string,
    characteristicId: string,
  ): Promise<void> {
    await BleClient.stopNotifications(
      this.bleDevice.deviceId,
      serviceId,
      characteristicId,
    );
    const key = this.getNotificationKey(serviceId, characteristicId);
    this.internalNotificationListeners.delete(key);
  }

  /**
   * Write to characteristic and wait for a notification response.
   *
   * It is the responsibility of the caller to have started notifications
   * for the characteristic.
   */
  async writeForNotification(
    serviceId: string,
    characteristicId: string,
    value: DataView,
    notificationId: number,
    isFinalNotification: (p: Uint8Array) => boolean = () => true,
  ): Promise<Uint8Array> {
    let notificationListener: ((bytes: Uint8Array) => void) | undefined;
    const notificationPromise = new Promise<Uint8Array>((resolve) => {
      notificationListener = (bytes: Uint8Array) => {
        if (bytes[0] === notificationId && isFinalNotification(bytes)) {
          resolve(bytes);
        }
      };
      this.subscribe(serviceId, characteristicId, notificationListener);
    });

    try {
      await BleClient.writeWithoutResponse(
        this.bleDevice.deviceId,
        serviceId,
        characteristicId,
        value,
      );
      return await this.raceDisconnectAndTimeout(notificationPromise, {
        timeout: 3_000,
        actionName: "flash notification wait",
      });
    } finally {
      if (notificationListener) {
        this.unsubscribe(serviceId, characteristicId, notificationListener);
      }
    }
  }

  async waitForDisconnect(timeout: number): Promise<void> {
    if (!this.connected) {
      this.log("Waiting for disconnect but not connected");
      return;
    }
    this.log(`Waiting for disconnect (timeout ${timeout})`);
    try {
      await Promise.race([
        this.disconnectErrorPromise("wait"),
        timeoutErrorAfter(timeout),
      ]);
    } catch (e) {
      if (e instanceof TimeoutError) {
        this.error("Timeout waiting for disconnect");
      }
      if (!(e instanceof DisconnectError)) {
        throw e;
      }
    }
  }

  /**
   * Suitable for running a series of BLE interactions with an overall timeout
   * and general disconnection
   */
  async raceDisconnectAndTimeout<T>(
    promise: Promise<T>,
    options: {
      actionName?: string;
      timeout?: number;
    } = {},
  ): Promise<T> {
    if (!this.connected) {
      throw new DisconnectError();
    }
    const actionName = options.actionName ?? "action";
    const errorOnDisconnectPromise = this.disconnectErrorPromise<T>(actionName);
    return await Promise.race<T>([
      promise,
      errorOnDisconnectPromise,
      ...(options.timeout ? [timeoutErrorAfter<T>(options.timeout)] : []),
    ]);
  }

  private disconnectErrorPromise<T>(actionName: string): Promise<T> {
    const { promise, callback } = disconnectErrorCallback<T>(
      `Disconnected during ${actionName}`,
    );
    this.waitingForDisconnectEventCallbacks.push(callback);
    return promise;
  }

  event(event: LoggingEvent) {
    this.logging.event(event);
  }

  log(message: string) {
    this.logging.log(message);
  }

  error(message: string, e?: unknown) {
    this.logging.error(message, e);
  }

  private getNotificationKey(
    serviceId: string,
    characteristicId: string,
  ): string {
    return `${serviceId}:${characteristicId}`;
  }

  /**
   * Bonds with device and handles the post-bond device state only returning
   * when we can reattempt a connection with the device.
   */
  private async connectHandlingBond(
    progress: ProgressCallback,
    isAlreadyIosBonded: boolean,
    bondMode: "pairing" | "application",
  ): Promise<void> {
    progress(ProgressStage.CheckingBond);
    const startTime = Date.now();
    const maybeJustBonded =
      await this.bondConnectDeviceInternal(isAlreadyIosBonded);
    if (maybeJustBonded) {
      // If we did just bond then the device disconnects after 2_000 and then
      // resets after a further 13_000 In future we'd like a firmware change
      // that means it doesn't reset when partial flashing is in progress.
      this.log(isAndroid() ? "New bond" : "Potential new bond");

      // On Android with micro:bit V1 we don't see this disconnect (just the 15s
      // reboot) so we hit the timeout and then continue to reset into pairing
      // mode.
      // TODO: document what happens with iOS micro:bit V1 in the new bond case.
      try {
        await this.waitForDisconnect(3000);
      } catch (e) {
        if (e instanceof TimeoutError) {
          this.log("No disconnect after bond, assuming connection is stable");
          if (!isAndroid()) {
            // We never knew for sure whether this was a new bond. Assume we
            // were already bonded on the basis we didn't get disconnected.
            return;
          }
        } else {
          throw e;
        }
      }

      await this.connectInternal();

      try {
        const targetMode =
          bondMode === "pairing"
            ? MicroBitMode.Pairing
            : MicroBitMode.Application;
        progress(ProgressStage.ResettingDevice);
        this.log(`Resetting to ${bondMode} mode`);
        const pf = new PartialFlashingService(this);
        await pf.resetToMode(targetMode);
        await this.waitForDisconnect(10_000);

        progress(ProgressStage.Connecting);
        await this.connectInternal();
      } catch (e) {
        if (isCharacteristicNotFoundError(e)) {
          this.log(
            "Partial flashing characteristic not found, skipping reset.",
          );
        } else {
          throw e;
        }
      }
    }
    this.log(`Connection ready; took ${Date.now() - startTime}`);
  }

  private async bondConnectDeviceInternal(
    isAlreadyIosBonded: boolean,
  ): Promise<boolean> {
    const { deviceId } = this.bleDevice;
    if (isAndroid()) {
      let justBonded = false;
      // This gets us a nicer pairing dialog than just going straight for the characteristic.
      if (!(await BleClient.isBonded(deviceId))) {
        await BleClient.createBond(deviceId, { timeout: bondingTimeoutInMs });
        justBonded = true;
      }
      await this.connectInternal();

      return justBonded;
    } else {
      // Long timeout as this is the point that the pairing dialog will show.
      // If this responds very quickly maybe we could assume there was a bond?
      // At the moment we always do the disconnect dance so subsequent code will
      // need to call startNotifications again. We need to be connected to
      // startNotifications.
      await this.connectInternal();
      if (!isAlreadyIosBonded) {
        await this.triggerIosPairing({ timeout: bondingTimeoutInMs });
      }
      return !isAlreadyIosBonded;
    }
  }

  /**
   * On iOS, accessing an encrypted characteristic triggers the pairing dialog.
   * Try each candidate characteristic in turn until one succeeds. The error is
   * fast (local GATT cache lookup) so there's no meaningful delay from retries.
   */
  private async triggerIosPairing(options: TimeoutOptions): Promise<void> {
    const { deviceId } = this.bleDevice;

    // 1. Partial flashing notifications (most common case)
    try {
      const pf = new PartialFlashingService(this);
      await pf.startNotifications(options);
      await pf.stopNotifications();
      return;
    } catch (e) {
      if (!isCharacteristicNotFoundError(e)) {
        throw e;
      }
      this.log(
        "PF characteristic not found for pairing trigger, trying Secure DFU",
      );
    }

    // 2. Nordic Secure DFU buttonless notifications (V2 without PF)
    try {
      await BleClient.startNotifications(
        deviceId,
        profile.nordicSecureDfu.id,
        profile.nordicSecureDfu.characteristics.buttonless.id,
        () => {},
        options,
      );
      await BleClient.stopNotifications(
        deviceId,
        profile.nordicSecureDfu.id,
        profile.nordicSecureDfu.characteristics.buttonless.id,
      );
      return;
    } catch (e) {
      if (!isCharacteristicNotFoundError(e)) {
        throw e;
      }
      this.log(
        "Secure DFU characteristic not found for pairing trigger, trying DFU control",
      );
    }

    // 3. micro:bit DFU control read (V1 without PF)
    try {
      await BleClient.read(
        deviceId,
        profile.dfuControl.id,
        profile.dfuControl.characteristics.control.id,
        options,
      );
    } catch (e) {
      if (!isCharacteristicNotFoundError(e)) {
        throw e;
      }
      this.log("No suitable characteristic found to trigger pairing");
    }
  }
}
