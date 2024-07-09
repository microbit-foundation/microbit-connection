/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { Logging, NullLogging } from "./logging";
import { withTimeout, TimeoutError } from "./async-util";
import { DAPWrapper } from "./dap-wrapper";
import { PartialFlashing } from "./partial-flashing";
import {
  BoardVersion,
  ConnectionStatus,
  ConnectOptions,
  DeviceConnection,
  DeviceConnectionEventMap,
  EndUSBSelect,
  FlashDataSource,
  FlashEvent,
  HexGenerationError,
  MicrobitWebUSBConnectionOptions,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
  StartUSBSelect,
  ConnectionStatusEvent,
  WebUSBError,
} from "./device";
import { TypedEventTarget } from "./events";
import { createBluetoothDeviceWrapper } from "./bluetooth-device-wrapper";
import { profile } from "./bluetooth-profile";

const requestDeviceTimeoutDuration: number = 30000;
// After how long should we consider the connection lost if ping was not able to conclude?
const connectionLostTimeoutDuration: number = 3000;

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

  constructor(
    options: MicrobitWebUSBConnectionOptions = { logging: new NullLogging() }
  ) {
    super();
    this.logging = options.logging;
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
    return this.withEnrichedErrors(async () => {
      await this.connectInternal(options);
      return this.status;
    });
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
    this.flashing = true;
    try {
      const startTime = new Date().getTime();
      await this.withEnrichedErrors(() =>
        this.flashInternal(dataSource, options)
      );
      this.dispatchTypedEvent("flash", new FlashEvent());

      const flashTime = new Date().getTime() - startTime;
      this.logging.event({
        type: "WebUSB-time",
        detail: {
          flashTime,
        },
      });
      this.logging.log("Flash complete");
    } finally {
      this.flashing = false;
    }
  }

  private async flashInternal(
    dataSource: FlashDataSource,
    options: {
      partial: boolean;
      progress: (percentage: number | undefined, partial: boolean) => void;
    }
  ): Promise<void> {
    this.log("Stopping serial before flash");
    await this.stopSerialInternal();
    this.log("Reconnecting before flash");
    await this.connectInternal({
      serial: false,
    });
    if (!this.connection) {
      throw new Error("Must be connected now");
    }

    const partial = options.partial;
    const progress = options.progress || (() => {});

    const boardId = this.connection.boardSerialInfo.id;
    const flashing = new PartialFlashing(this.connection, this.logging);
    let wasPartial: boolean = false;
    try {
      if (partial) {
        wasPartial = await flashing.flashAsync(boardId, dataSource, progress);
      } else {
        await flashing.fullFlashAsync(boardId, dataSource, progress);
      }
    } finally {
      progress(undefined, wasPartial);

      if (this.disconnectAfterFlash) {
        this.log("Disconnecting after flash due to tab visibility");
        this.disconnectAfterFlash = false;
        await this.disconnect();
        this.visibilityReconnect = true;
      } else {
        // This might not strictly be "reinstating". We should make this
        // behaviour configurable when pulling out a library.
        this.log("Reinstating serial after flash");
        if (this.connection.daplink) {
          await this.connection.daplink.connect();
          await this.startSerialInternal();
        }
      }
    }
  }

  private async startSerialInternal() {
    if (!this.connection) {
      // As connecting then starting serial are async we could disconnect between them,
      // so handle this gracefully.
      return;
    }
    if (this.serialReadInProgress) {
      await this.stopSerialInternal();
    }
    // This is async but won't return until we stop serial so we error handle with an event.
    this.serialReadInProgress = this.connection
      .startSerial(this.serialListener)
      .then(() => this.log("Finished listening for serial data"))
      .catch((e) => {
        this.dispatchTypedEvent("serial_error", new SerialErrorEvent(e));
      });
  }

  private async stopSerialInternal() {
    if (this.connection && this.serialReadInProgress) {
      this.connection.stopSerial(this.serialListener);
      await this.serialReadInProgress;
      this.serialReadInProgress = undefined;
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
        type: "WebUSB-error",
        message: "error-disconnecting",
      });
    } finally {
      this.connection = undefined;
      this.setStatus(ConnectionStatus.NOT_CONNECTED);
      this.logging.log("Disconnection complete");
      this.logging.event({
        type: "WebUSB-info",
        message: "disconnected",
      });
    }
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.visibilityReconnect = false;
    this.log("Device status " + newStatus);
    this.dispatchTypedEvent("status", new ConnectionStatusEvent(newStatus));
  }

  private async withEnrichedErrors<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e: any) {
      if (e instanceof HexGenerationError) {
        throw e;
      }

      // Log error to console for feedback
      this.log("An error occurred whilst attempting to use Bluetooth.");
      this.log(
        "Details of the error can be found below, and may be useful when trying to replicate and debug the error."
      );
      this.log(e);

      // Disconnect from the microbit.
      // Any new connection reallocates all the internals.
      // Use the top-level API so any listeners reflect that we're disconnected.
      await this.disconnect();

      const enriched = enrichedError(e);
      // Sanitise error message, replace all special chars with '-', if last char is '-' remove it
      const errorMessage = e.message
        ? e.message.replace(/\W+/g, "-").replace(/\W$/, "").toLowerCase()
        : "";

      this.logging.event({
        type: "WebUSB-error",
        message: e.code + "/" + errorMessage,
      });
      throw enriched;
    }
  }

  serialWrite(data: string): Promise<void> {
    return this.withEnrichedErrors(async () => {
      if (this.connection) {
        // Using WebUSB/DAPJs we're limited to 64 byte packet size with a two byte header.
        // https://github.com/microbit-foundation/python-editor-v3/issues/215
        const maxSerialWrite = 62;
        let start = 0;
        while (start < data.length) {
          const end = Math.min(start + maxSerialWrite, data.length);
          const chunkData = data.slice(start, end);
          await this.connection.daplink.serialWrite(chunkData);
          start = end;
        }
      }
    });
  }

  private handleDisconnect = (event: Event) => {
    if (event.device === this.device) {
      this.connection = undefined;
      this.device = undefined;
      this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
    }
  };

  async clearDevice(): Promise<void> {
    await this.disconnect();
    this.device = undefined;
    this.setStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE);
  }

  private async connectInternal(options: ConnectOptions): Promise<void> {
    if (!this.connection) {
      const device = await this.chooseDevice();
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

const genericErrorSuggestingReconnect = (e: any) =>
  new WebUSBError({
    code: "reconnect-microbit",
    message: e.message,
  });

// tslint:disable-next-line: no-any
const enrichedError = (err: any): WebUSBError => {
  if (err instanceof WebUSBError) {
    return err;
  }
  if (err instanceof TimeoutError) {
    return new WebUSBError({
      code: "timeout-error",
      message: err.message,
    });
  }

  switch (typeof err) {
    case "object":
      // We might get Error objects as Promise rejection arguments
      if (!err.message && err.promise && err.reason) {
        err = err.reason;
      }
      // This is somewhat fragile but worth it for scenario specific errors.
      // These messages changed to be prefixed in 2023 so we've relaxed the checks.
      if (/No valid interfaces found/.test(err.message)) {
        // This comes from DAPjs's WebUSB open.
        return new WebUSBError({
          code: "update-req",
          message: err.message,
        });
      } else if (/No device selected/.test(err.message)) {
        return new WebUSBError({
          code: "no-device-selected",
          message: err.message,
        });
      } else if (/Unable to claim interface/.test(err.message)) {
        return new WebUSBError({
          code: "clear-connect",
          message: err.message,
        });
      } else if (err.name === "device-disconnected") {
        return new WebUSBError({
          code: "device-disconnected",
          message: err.message,
        });
      } else {
        // Unhandled error. User will need to reconnect their micro:bit
        return genericErrorSuggestingReconnect(err);
      }
    case "string": {
      // Caught a string. Example case: "Flash error" from DAPjs
      return genericErrorSuggestingReconnect(err);
    }
    default: {
      return genericErrorSuggestingReconnect(err);
    }
  }
};
