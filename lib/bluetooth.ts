/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { AccelerometerData } from "./accelerometer";
import {
  BluetoothDeviceWrapper,
  createBluetoothDeviceWrapper,
} from "./bluetooth-device-wrapper";
import { profile } from "./bluetooth-profile";
import {
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectOptions,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  FlashDataSource,
  SerialResetEvent,
} from "./device";
import { TypedEventTarget } from "./events";
import { Logging, NullLogging } from "./logging";
import { ServiceConnectionEventMap, TypedServiceEvent } from "./service-events";

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
  // TODO: when do we call getAvailable() ?
  status: ConnectionStatus = navigator.bluetooth
    ? ConnectionStatus.NO_AUTHORIZED_DEVICE
    : ConnectionStatus.NOT_SUPPORTED;

  /**
   * The USB device we last connected to.
   * Cleared if it is disconnected.
   */
  private device: BluetoothDevice | undefined;

  private logging: Logging;
  connection: BluetoothDeviceWrapper | undefined;

  private _addEventListener = this.addEventListener;
  private _removeEventListener = this.removeEventListener;

  constructor(options: MicrobitWebBluetoothConnectionOptions = {}) {
    super();
    this.logging = options.logging || new NullLogging();
    this.addEventListener = (type, ...args) => {
      this._addEventListener(type, ...args);
      this.startNotifications(type);
    };
    this.removeEventListener = (type, ...args) => {
      this.stopNotifications(type);
      this._removeEventListener(type, ...args);
    };
  }

  private log(v: any) {
    this.logging.log(v);
  }

  async initialize(): Promise<void> {
    if (navigator.bluetooth) {
      // TODO: availabilitychanged
    }
  }

  dispose() {
    if (navigator.bluetooth) {
      // TODO: availabilitychanged
    }
  }

  async connect(options: ConnectOptions = {}): Promise<ConnectionStatus> {
    await this.connectInternal(options);
    return this.status;
  }

  getBoardVersion(): BoardVersion | undefined {
    return this.connection?.boardVersion;
  }

  async flash(
    dataSource: FlashDataSource,
    options: {
      /**
       * True to use a partial flash where possible, false to force a full flash.
       */
      partial: boolean;
      /**
       * A progress callback. Called with undefined when the process is complete or has failed.
       */
      progress: (percentage: number | undefined) => void;
    },
  ): Promise<void> {
    throw new Error("Unsupported");
  }

  // @ts-ignore
  private async startSerialInternal() {
    if (!this.connection) {
      // As connecting then starting serial are async we could disconnect between them,
      // so handle this gracefully.
      return;
    }
    // TODO
  }

  // @ts-ignore
  private async stopSerialInternal() {
    if (this.connection) {
      // TODO
      this.dispatchTypedEvent("serialreset", new SerialResetEvent());
    }
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
    this.log("Device status " + newStatus);
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

  private async startAccelerometerNotifications() {
    const accelerometerService =
      await this.connection?.getAccelerometerService();
    accelerometerService?.startNotifications();
    if (this.connection) {
      this.connection.serviceListeners.accelerometerdatachanged.notifying =
        true;
    }
  }

  private async stopAccelerometerNotifications() {
    const accelerometerService =
      await this.connection?.getAccelerometerService();
    if (this.connection) {
      this.connection.serviceListeners.accelerometerdatachanged.notifying =
        false;
    }
    accelerometerService?.stopNotifications();
  }

  private async startNotifications(type: string) {
    switch (type as TypedServiceEvent) {
      case "accelerometerdatachanged": {
        this.startAccelerometerNotifications();
        break;
      }
    }
  }

  private async stopNotifications(type: string) {
    switch (type as TypedServiceEvent) {
      case "accelerometerdatachanged": {
        this.stopAccelerometerNotifications();
        break;
      }
    }
  }
}
