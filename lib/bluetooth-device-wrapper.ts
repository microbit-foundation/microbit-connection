/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import { profile } from "./bluetooth-profile";
import { DeviceVersion } from "./device-version";
import { Logging, NullLogging } from "./logging";

const deviceIdToWrapper: Map<string, BluetoothDeviceWrapper> = new Map();

const connectTimeoutDuration: number = 10000;

function findPlatform(): string | undefined {
  const navigator: any = window.navigator;
  const platform = navigator.userAgentData?.platform;
  if (platform) {
    return platform;
  }
  const isAndroid = /android/.test(navigator.userAgent.toLowerCase());
  return isAndroid ? "android" : navigator.platform ?? "unknown";
}
const platform = findPlatform();
const isWindowsOS = platform && /^Win/.test(platform);

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
  private gattConnectPromise: Promise<DeviceVersion | undefined> | undefined;
  private disconnectPromise: Promise<unknown> | undefined;
  private connecting = false;
  private isReconnect = false;
  private reconnectReadyPromise: Promise<void> | undefined;
  // Whether this is the final reconnection attempt.
  private finalAttempt = false;

  constructor(
    public readonly device: BluetoothDevice,
    private logging: Logging = new NullLogging()
  ) {
    device.addEventListener(
      "gattserverdisconnected",
      this.handleDisconnectEvent
    );
  }

  async connect(): Promise<void> {
    this.logging.event({
      type: this.isReconnect ? "Reconnect" : "Connect",
      message: "Bluetooth connect start",
    });
    if (this.duringExplicitConnectDisconnect) {
      this.logging.log(
        "Skipping connect attempt when one is already in progress"
      );
      // Wait for the gattConnectPromise while showing a "connecting" dialog.
      // If the user clicks disconnect while the automatic reconnect is in progress,
      // then clicks reconnect, we need to wait rather than return immediately.
      await this.gattConnectPromise;
      return;
    }
    this.duringExplicitConnectDisconnect++;
    if (this.device.gatt === undefined) {
      throw new Error(
        "BluetoothRemoteGATTServer for micro:bit device is undefined"
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
            const deviceVersion = await this.getDeviceVersion();
            // This connection could be arbitrarily later when our manual timeout may have passed.
            // Do we still want to be connected?
            if (!this.connecting) {
              this.logging.log(
                "Bluetooth GATT server connect after timeout, triggering disconnect"
              );
              this.disconnectPromise = (async () => {
                await this.disconnectInternal(false, false);
                this.disconnectPromise = undefined;
              })();
            } else {
              this.logging.log(
                "Bluetooth GATT server connected when connecting"
              );
            }
            return deviceVersion;
          })
          .catch((e) => {
            if (this.connecting) {
              // Error will be logged by main connect error handling.
              throw e;
            } else {
              this.logging.error(
                "Bluetooth GATT server connect error after our timeout",
                e
              );
              return undefined;
            }
          })
          .finally(() => {
            this.logging.log("Bluetooth GATT server promise field cleared");
            this.gattConnectPromise = undefined;
          });

      this.connecting = true;
      let deviceVersion: DeviceVersion | undefined;
      try {
        const gattConnectResult = await Promise.race([
          this.gattConnectPromise,
          new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), connectTimeoutDuration)
          ),
        ]);
        if (gattConnectResult === "timeout") {
          this.logging.log("Bluetooth GATT server connect timeout");
          throw new Error("Bluetooth GATT server connect timeout");
        }
        deviceVersion = gattConnectResult;
      } finally {
        this.connecting = false;
      }

      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Bluetooth connect success",
      });
    } catch (e) {
      this.logging.error("Bluetooth connect error", e);
      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Bluetooth connect failed",
      });
      await this.disconnectInternal(false);
      throw new Error("Failed to establish a connection!");
    } finally {
      this.finalAttempt = false;
      this.duringExplicitConnectDisconnect--;
    }
  }

  async disconnect(): Promise<void> {
    return this.disconnectInternal(true);
  }

  private async disconnectInternal(
    userTriggered: boolean,
    updateState: boolean = true
  ): Promise<void> {
    this.logging.log(
      `Bluetooth disconnect ${userTriggered ? "(user triggered)" : "(programmatic)"}`
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
      this.duringExplicitConnectDisconnect--;
    }
    this.reconnectReadyPromise = new Promise((resolve) =>
      setTimeout(resolve, 3_500)
    );
  }

  async reconnect(finalAttempt: boolean = false): Promise<void> {
    this.finalAttempt = finalAttempt;
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
    // this.outputWriteQueue = { busy: false, queue: [] };

    try {
      if (!this.duringExplicitConnectDisconnect) {
        this.logging.log(
          "Bluetooth GATT disconnected... automatically trying reconnect"
        );
        // stateOnReconnectionAttempt();
        await this.reconnect();
      } else {
        this.logging.log(
          "Bluetooth GATT disconnect ignored during explicit disconnect"
        );
      }
    } catch (e) {
      this.logging.error(
        "Bluetooth connect triggered by disconnect listener failed",
        e
      );
    }
  };

  private assertGattServer(): BluetoothRemoteGATTServer {
    if (!this.device.gatt?.connected) {
      throw new Error("Could not listen to services, no microbit connected!");
    }
    return this.device.gatt;
  }
  /**
   * Fetches the model number of the micro:bit.
   * @param {BluetoothRemoteGATTServer} gattServer The GATT server to read from.
   * @return {Promise<number>} The model number of the micro:bit. 1 for the original, 2 for the new.
   */
  private async getDeviceVersion(): Promise<DeviceVersion> {
    this.assertGattServer();
    const serviceMeta = profile.deviceInformation;
    try {
      const deviceInfo = await this.assertGattServer().getPrimaryService(
        serviceMeta.id
      );
      const characteristic = await deviceInfo.getCharacteristic(
        serviceMeta.characteristics.modelNumber.id
      );
      const modelNumberBytes = await characteristic.readValue();
      const modelNumber = new TextDecoder().decode(modelNumberBytes);
      if (modelNumber.toLowerCase() === "BBC micro:bit".toLowerCase()) {
        return DeviceVersion.V1;
      }
      if (
        modelNumber.toLowerCase().includes("BBC micro:bit v2".toLowerCase())
      ) {
        return DeviceVersion.V2;
      }
      throw new Error(`Unexpected model number ${modelNumber}`);
    } catch (e) {
      this.logging.error("Could not read model number", e);
      throw new Error("Could not read model number");
    }
  }
}

export const createBluetoothDeviceWrapper = async (
  device: BluetoothDevice,
  logging: Logging
): Promise<BluetoothDeviceWrapper | undefined> => {
  try {
    // Reuse our connection objects for the same device as they
    // track the GATT connect promise that never resolves.
    const bluetooth =
      deviceIdToWrapper.get(device.id) ??
      new BluetoothDeviceWrapper(device, logging);
    deviceIdToWrapper.set(device.id, bluetooth);
    await bluetooth.connect();
    return bluetooth;
  } catch (e) {
    return undefined;
  }
};
