/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import { AccelerometerService } from "./accelerometer-service.js";
import { profile } from "./bluetooth-profile.js";
import { ButtonService } from "./button-service.js";
import { BoardVersion, DeviceError } from "./device.js";
import { Logging, NullLogging } from "./logging.js";
import { PromiseQueue } from "./promise-queue.js";
import {
  ServiceConnectionEventMap,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

const deviceIdToWrapper: Map<string, BluetoothDeviceWrapper> = new Map();

const connectTimeoutDuration: number = 10000;

function findPlatform(): string | undefined {
  const navigator: any =
    typeof window !== "undefined" ? window.navigator : undefined;
  if (!navigator) {
    return "unknown";
  }
  const platform = navigator.userAgentData?.platform;
  if (platform) {
    return platform;
  }
  const isAndroid = /android/.test(navigator.userAgent.toLowerCase());
  return isAndroid ? "android" : navigator.platform ?? "unknown";
}
const platform = findPlatform();
const isWindowsOS = platform && /^Win/.test(platform);

export interface Service {
  startNotifications(type: TypedServiceEvent): Promise<void>;
  stopNotifications(type: TypedServiceEvent): Promise<void>;
}

class ServiceInfo<T extends Service> {
  private service: T | undefined;

  constructor(
    private serviceFactory: (
      gattServer: BluetoothRemoteGATTServer,
      dispatcher: TypedServiceEventDispatcher,
      queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
      listenerInit: boolean,
    ) => Promise<T | undefined>,
    public events: TypedServiceEvent[],
  ) {}

  get(): T | undefined {
    return this.service;
  }

  async createIfNeeded(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<T | undefined> {
    this.service =
      this.service ??
      (await this.serviceFactory(
        gattServer,
        dispatcher,
        queueGattOperation,
        listenerInit,
      ));
    return this.service;
  }

  dispose() {
    this.service = undefined;
  }
}

interface ConnectCallbacks {
  onConnecting: () => void;
  onReconnecting: () => void;
  onFail: () => void;
  onSuccess: () => void;
}

export class BluetoothDeviceWrapper {
  // Used to avoid automatic reconnection during user triggered connect/disconnect
  // or reconnection itself.
  private duringExplicitConnectDisconnect: number = 0;

  // On ChromeOS and Mac there's no timeout and no clear way to abort
  // device.gatt.connect(), so we accept that sometimes we'll still
  // be trying to connect when we'd rather not be. If it succeeds when
  // we no longer intend to be connected then we disconnect at that
  // point. If we try to connect when a previous connection attempt is
  // still around then we wait for it for our timeout period.
  //
  // On Windows it times out after 7s.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=684073
  private gattConnectPromise: Promise<void> | undefined;
  private disconnectPromise: Promise<unknown> | undefined;
  private connecting = false;
  private isReconnect = false;
  private reconnectReadyPromise: Promise<void> | undefined;

  private accelerometer = new ServiceInfo(AccelerometerService.createService, [
    "accelerometerdatachanged",
  ]);
  private buttons = new ServiceInfo(ButtonService.createService, [
    "buttonachanged",
    "buttonbchanged",
  ]);
  private serviceInfo = [this.accelerometer, this.buttons];

  boardVersion: BoardVersion | undefined;

  private disconnectedRejectionErrorFactory = () => {
    return new DeviceError({
      code: "device-disconnected",
      message: "Error processing gatt operations queue - device disconnected",
    });
  };

  private gattOperations = new PromiseQueue({
    abortCheck: () => {
      if (!this.device.gatt?.connected) {
        return this.disconnectedRejectionErrorFactory;
      }
      return undefined;
    },
  });

  constructor(
    public readonly device: BluetoothDevice,
    private logging: Logging = new NullLogging(),
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private currentEvents: () => Array<keyof ServiceConnectionEventMap>,
    private callbacks: ConnectCallbacks,
  ) {
    device.addEventListener(
      "gattserverdisconnected",
      this.handleDisconnectEvent,
    );
  }

  async connect(): Promise<void> {
    this.logging.event({
      type: this.isReconnect ? "Reconnect" : "Connect",
      message: "Bluetooth connect start",
    });
    if (this.duringExplicitConnectDisconnect) {
      this.logging.log(
        "Skipping connect attempt when one is already in progress",
      );
      // Wait for the gattConnectPromise while showing a "connecting" dialog.
      // If the user clicks disconnect while the automatic reconnect is in progress,
      // then clicks reconnect, we need to wait rather than return immediately.
      await this.gattConnectPromise;
      return;
    }
    if (this.isReconnect) {
      this.callbacks.onReconnecting();
    } else {
      this.callbacks.onConnecting();
    }
    this.duringExplicitConnectDisconnect++;
    if (this.device.gatt === undefined) {
      throw new Error(
        "BluetoothRemoteGATTServer for micro:bit device is undefined",
      );
    }
    try {
      // A previous connect might have completed in the background as a device was replugged etc.
      await this.disconnectPromise;
      this.gattConnectPromise =
        this.gattConnectPromise ??
        this.device.gatt
          .connect()
          .then(async () => {
            // We always do this even if we might immediately disconnect as disconnecting
            // without using services causes getPrimaryService calls to hang on subsequent
            // reconnect - probably a device-side issue.
            this.boardVersion = await this.getBoardVersion();
            // This connection could be arbitrarily later when our manual timeout may have passed.
            // Do we still want to be connected?
            if (!this.connecting) {
              this.logging.log(
                "Bluetooth GATT server connect after timeout, triggering disconnect",
              );
              this.disconnectPromise = (async () => {
                await this.disconnectInternal(false);
                this.disconnectPromise = undefined;
              })();
            } else {
              this.logging.log(
                "Bluetooth GATT server connected when connecting",
              );
            }
          })
          .catch((e) => {
            if (this.connecting) {
              // Error will be logged by main connect error handling.
              throw e;
            } else {
              this.logging.error(
                "Bluetooth GATT server connect error after our timeout",
                e,
              );
              return undefined;
            }
          })
          .finally(() => {
            this.logging.log("Bluetooth GATT server promise field cleared");
            this.gattConnectPromise = undefined;
          });

      this.connecting = true;
      try {
        const gattConnectResult = await Promise.race([
          this.gattConnectPromise,
          new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), connectTimeoutDuration),
          ),
        ]);
        if (gattConnectResult === "timeout") {
          this.logging.log("Bluetooth GATT server connect timeout");
          throw new Error("Bluetooth GATT server connect timeout");
        }
      } finally {
        this.connecting = false;
      }

      this.currentEvents().forEach((e) =>
        this.startNotifications(e as TypedServiceEvent),
      );

      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Bluetooth connect success",
      });
      this.callbacks.onSuccess();
    } catch (e) {
      this.logging.error("Bluetooth connect error", e);
      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Bluetooth connect failed",
      });
      await this.disconnectInternal(false);
      this.callbacks.onFail();
      throw new Error("Failed to establish a connection!");
    } finally {
      this.duringExplicitConnectDisconnect--;
      // Reset isReconnect for next time
      this.isReconnect = false;
    }
  }

  async disconnect(): Promise<void> {
    return this.disconnectInternal(true);
  }

  private async disconnectInternal(userTriggered: boolean): Promise<void> {
    this.logging.log(
      `Bluetooth disconnect ${userTriggered ? "(user triggered)" : "(programmatic)"}`,
    );
    this.duringExplicitConnectDisconnect++;
    try {
      if (this.device.gatt?.connected) {
        this.device.gatt?.disconnect();
      }
    } catch (e) {
      this.logging.error("Bluetooth GATT disconnect error (ignored)", e);
      // We might have already lost the connection.
    } finally {
      this.disposeServices();
      this.duringExplicitConnectDisconnect--;
    }
    this.reconnectReadyPromise = new Promise((resolve) =>
      setTimeout(resolve, 3_500),
    );
  }

  async reconnect(): Promise<void> {
    this.logging.log("Bluetooth reconnect");
    this.isReconnect = true;
    if (isWindowsOS) {
      // On Windows, the micro:bit can take around 3 seconds to respond to gatt.disconnect().
      // Attempting to reconnect before the micro:bit has responded results in another
      // gattserverdisconnected event being fired. We then fail to get primaryService on a
      // disconnected GATT server.
      await this.reconnectReadyPromise;
    }
    await this.connect();
  }

  handleDisconnectEvent = async (): Promise<void> => {
    try {
      if (!this.duringExplicitConnectDisconnect) {
        this.logging.log(
          "Bluetooth GATT disconnected... automatically trying reconnect",
        );
        // stateOnReconnectionAttempt();
        this.disposeServices();
        await this.reconnect();
      } else {
        this.logging.log(
          "Bluetooth GATT disconnect ignored during explicit disconnect",
        );
      }
    } catch (e) {
      this.logging.error(
        "Bluetooth connect triggered by disconnect listener failed",
        e,
      );
    }
  };

  private assertGattServer(): BluetoothRemoteGATTServer {
    if (!this.device.gatt?.connected) {
      throw new Error("Could not listen to services, no microbit connected!");
    }
    return this.device.gatt;
  }

  private async getBoardVersion(): Promise<BoardVersion> {
    this.assertGattServer();
    const serviceMeta = profile.deviceInformation;
    try {
      const deviceInfo = await this.assertGattServer().getPrimaryService(
        serviceMeta.id,
      );
      const characteristic = await deviceInfo.getCharacteristic(
        serviceMeta.characteristics.modelNumber.id,
      );
      const modelNumberBytes = await characteristic.readValue();
      const modelNumber = new TextDecoder().decode(modelNumberBytes);
      if (modelNumber.toLowerCase() === "BBC micro:bit".toLowerCase()) {
        return "V1";
      }
      if (
        modelNumber.toLowerCase().includes("BBC micro:bit v2".toLowerCase())
      ) {
        return "V2";
      }
      throw new Error(`Unexpected model number ${modelNumber}`);
    } catch (e) {
      this.logging.error("Could not read model number", e);
      throw new Error("Could not read model number");
    }
  }

  private queueGattOperation<T>(action: () => Promise<T>): Promise<T> {
    // Previously we wrapped rejections with:
    // new DeviceError({ code: "background-comms-error", message: err }),
    return this.gattOperations.add(action);
  }

  private createIfNeeded<T extends Service>(
    info: ServiceInfo<T>,
    listenerInit: boolean,
  ): Promise<T | undefined> {
    const gattServer = this.assertGattServer();
    return info.createIfNeeded(
      gattServer,
      this.dispatchTypedEvent,
      this.queueGattOperation.bind(this),
      listenerInit,
    );
  }

  async getAccelerometerService(): Promise<AccelerometerService | undefined> {
    return this.createIfNeeded(this.accelerometer, false);
  }

  async startNotifications(type: TypedServiceEvent) {
    const serviceInfo = this.serviceInfo.find((s) => s.events.includes(type));
    if (serviceInfo) {
      this.queueGattOperation(async () => {
        // TODO: type cheat! why?
        const service = await this.createIfNeeded(serviceInfo as any, true);
        await service?.startNotifications(type);
      });
    }
  }

  async stopNotifications(type: TypedServiceEvent) {
    this.queueGattOperation(async () => {
      const serviceInfo = this.serviceInfo.find((s) => s.events.includes(type));
      await serviceInfo?.get()?.stopNotifications(type);
    });
  }

  private disposeServices() {
    this.serviceInfo.forEach((s) => s.dispose());
    this.gattOperations.clear(this.disconnectedRejectionErrorFactory);
  }
}

export const createBluetoothDeviceWrapper = async (
  device: BluetoothDevice,
  logging: Logging,
  dispatchTypedEvent: TypedServiceEventDispatcher,
  currentEvents: () => Array<keyof ServiceConnectionEventMap>,
  callbacks: ConnectCallbacks,
): Promise<BluetoothDeviceWrapper | undefined> => {
  try {
    // Reuse our connection objects for the same device as they
    // track the GATT connect promise that never resolves.
    const bluetooth =
      deviceIdToWrapper.get(device.id) ??
      new BluetoothDeviceWrapper(
        device,
        logging,
        dispatchTypedEvent,
        currentEvents,
        callbacks,
      );
    deviceIdToWrapper.set(device.id, bluetooth);
    await bluetooth.connect();
    return bluetooth;
  } catch (e) {
    return undefined;
  }
};
