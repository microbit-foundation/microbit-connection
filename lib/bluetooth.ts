/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { withTimeout } from "./async-util";
import { createBluetoothDeviceWrapper } from "./bluetooth-device-wrapper";
import { profile } from "./bluetooth-profile";
import {
  BoardVersion,
  ConnectOptions,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  EndUSBSelect,
  FlashDataSource,
  SerialResetEvent,
  StartUSBSelect,
} from "./device";
import { TypedEventTarget } from "./events";
import { Logging, NullLogging } from "./logging";

const requestDeviceTimeoutDuration: number = 30000;
// After how long should we consider the connection lost if ping was not able to conclude?
const connectionLostTimeoutDuration: number = 3000;

export interface MicrobitWebBluetoothConnectionOptions {
  logging?: Logging;
}

/**
 * A Bluetooth connection to a micro:bit device.
 */
export class MicrobitWebBluetoothConnection
  extends TypedEventTarget<DeviceConnectionEventMap>
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
  connection: any;
  flashing: boolean;

  constructor(options: MicrobitWebBluetoothConnectionOptions = {}) {
    super();
    this.logging = options.logging || new NullLogging();
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

  getBoardVersion(): BoardVersion | null {
    if (!this.connection) {
      return null;
    }
    const boardId = this.connection.boardSerialInfo.id;
    return boardId.isV1() ? "V1" : boardId.isV2() ? "V2" : null;
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
    }
  ): Promise<void> {
    throw new Error("Unsupported");
  }

  private async startSerialInternal() {
    if (!this.connection) {
      // As connecting then starting serial are async we could disconnect between them,
      // so handle this gracefully.
      return;
    }
    // TODO
  }

  private async stopSerialInternal() {
    if (this.connection) {
      // TODO
      this.dispatchTypedEvent("serial_reset", new SerialResetEvent());
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.stopSerialInternal();
        await this.connection.disconnectAsync();
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
      const device = await this.chooseDevice();
      if (!device) {
        return;
      }
      this.connection = createBluetoothDeviceWrapper(device, this.logging);
    }
    await withTimeout(this.connection.reconnectAsync(), 10_000);
    if (options.serial === undefined || options.serial) {
      this.startSerialInternal();
    }
    this.setStatus(ConnectionStatus.CONNECTED);
  }

  private async chooseDevice(): Promise<BluetoothDevice | undefined> {
    if (this.device) {
      return this.device;
    }
    this.dispatchTypedEvent("start_usb_select", new StartUSBSelect());
    try {
      // In some situations the Chrome device prompt simply doesn't appear so we time this out after 30 seconds and reload the page
      // TODO: give control over this to the caller
      const result = await Promise.race([
        navigator.bluetooth.requestDevice({
          // TODO: this is limiting
          filters: [{ namePrefix: `BBC micro:bit [${name}]` }],
          optionalServices: [
            // TODO: include everything or perhaps parameterise?
            profile.uart.id,
            profile.accelerometer.id,
            profile.deviceInformation.id,
            profile.led.id,
            profile.io.id,
            profile.button.id,
          ],
        }),
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), requestDeviceTimeoutDuration)
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
      this.dispatchTypedEvent("end_usb_select", new EndUSBSelect());
    }
  }
}
