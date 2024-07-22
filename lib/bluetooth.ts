/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { AccelerometerData } from "./accelerometer.js";
import {
  BluetoothDeviceWrapper,
  createBluetoothDeviceWrapper,
} from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import {
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectOptions,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { Logging, NullLogging } from "./logging.js";
import { ServiceConnectionEventMap } from "./service-events.js";

const requestDeviceTimeoutDuration: number = 30000;

export interface MicrobitWebBluetoothConnectionOptions {
  logging?: Logging;
}

/**
 * A Bluetooth connection to a micro:bit device.
 */
export class MicrobitWebBluetoothConnection
  extends TypedEventTarget<DeviceConnectionEventMap & ServiceConnectionEventMap>
  implements DeviceConnection
{
  status: ConnectionStatus = ConnectionStatus.SUPPORT_NOT_KNOWN;

  /**
   * The USB device we last connected to.
   * Cleared if it is disconnected.
   */
  private device: BluetoothDevice | undefined;

  private logging: Logging;
  connection: BluetoothDeviceWrapper | undefined;

  private _addEventListener = this.addEventListener;
  private _removeEventListener = this.removeEventListener;

  private activeEvents = {
    accelerometerdatachanged: false,
    buttonachanged: false,
    buttonbchanged: false,
  };

  private availabilityListener = (e: Event) => {
    // TODO: is this called? is `value` correct?
    const value = (e as any).value as boolean;
    this.availability = value;
  };
  private availability: boolean | undefined;

  constructor(options: MicrobitWebBluetoothConnectionOptions = {}) {
    super();
    this.logging = options.logging || new NullLogging();
    this.addEventListener = (type, ...args) => {
      this._addEventListener(type, ...args);
      this.connection?.startNotifications(type);
    };
    this.removeEventListener = (type, ...args) => {
      this.connection?.stopNotifications(type);
      this._removeEventListener(type, ...args);
    };
  }

  private log(v: any) {
    this.logging.log(v);
  }

  async initialize(): Promise<void> {
    navigator.bluetooth?.addEventListener(
      "availabilitychanged",
      this.availabilityListener,
    );
    this.availability = await navigator.bluetooth?.getAvailability();
    this.setStatus(
      this.availability
        ? ConnectionStatus.NO_AUTHORIZED_DEVICE
        : ConnectionStatus.NOT_SUPPORTED,
    );
  }

  dispose() {
    navigator.bluetooth?.removeEventListener(
      "availabilitychanged",
      this.availabilityListener,
    );
  }

  async connect(options: ConnectOptions = {}): Promise<ConnectionStatus> {
    await this.connectInternal(options);
    return this.status;
  }

  getBoardVersion(): BoardVersion | undefined {
    return this.connection?.boardVersion;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.disconnect();
      }
    } catch (e) {
      this.log("Error during disconnection:\r\n" + e);
      this.logging.event({
        type: "Bluetooth-error",
        message: "error-disconnecting",
      });
    } finally {
      this.connection = undefined;
      this.setStatus(ConnectionStatus.NOT_CONNECTED);
      this.logging.log("Disconnection complete");
      this.logging.event({
        type: "Bluetooth-info",
        message: "disconnected",
      });
    }
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.log("Bluetooth connection status " + newStatus);
    this.dispatchTypedEvent("status", new ConnectionStatusEvent(newStatus));
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

  private async connectInternal(options: ConnectOptions): Promise<void> {
    if (!this.connection) {
      const device = await this.chooseDevice(options);
      if (!device) {
        return;
      }
      this.connection = await createBluetoothDeviceWrapper(
        device,
        this.logging,
        this.dispatchTypedEvent.bind(this),
        this.activeEvents,
      );
    }
    // TODO: timeout unification?
    // Connection happens inside createBluetoothDeviceWrapper.
    // await this.connection?.connect();
    this.setStatus(ConnectionStatus.CONNECTED);
  }

  private async chooseDevice(
    options: ConnectOptions,
  ): Promise<BluetoothDevice | undefined> {
    if (this.device) {
      return this.device;
    }
    this.dispatchTypedEvent("beforerequestdevice", new BeforeRequestDevice());
    try {
      // In some situations the Chrome device prompt simply doesn't appear so we time this out after 30 seconds and reload the page
      // TODO: give control over this to the caller
      const result = await Promise.race([
        navigator.bluetooth.requestDevice({
          filters: [
            {
              namePrefix: options.name
                ? `BBC micro:bit [${options.name}]`
                : "BBC micro:bit",
            },
          ],
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
        }),
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), requestDeviceTimeoutDuration),
        ),
      ]);
      if (result === "timeout") {
        // btSelectMicrobitDialogOnLoad.set(true);
        window.location.reload();
        return undefined;
      }
      this.device = result;
      return result;
    } catch (e) {
      this.logging.error("Bluetooth request device failed/cancelled", e);
      return undefined;
    } finally {
      this.dispatchTypedEvent("afterrequestdevice", new AfterRequestDevice());
    }
  }

  async getAccelerometerData(): Promise<AccelerometerData | undefined> {
    const accelerometerService =
      await this.connection?.getAccelerometerService();
    return accelerometerService?.getData();
  }

  async getAccelerometerPeriod(): Promise<number | undefined> {
    const accelerometerService =
      await this.connection?.getAccelerometerService();
    return accelerometerService?.getPeriod();
  }

  async setAccelerometerPeriod(value: number): Promise<void> {
    const accelerometerService =
      await this.connection?.getAccelerometerService();
    accelerometerService?.setPeriod(value);
  }
}
