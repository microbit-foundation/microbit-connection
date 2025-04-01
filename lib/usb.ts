/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TimeoutError, withTimeout } from "./async-util.js";
import {
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  FlashDataSource,
  FlashOptions,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { Logging, NullLogging } from "./logging.js";
import { PromiseQueue } from "./promise-queue.js";
import {
  FlashEvent,
  SerialConnectionEventMap,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./serial-events.js";
import { DAPWrapper } from "./usb-device-wrapper.js";
import { PartialFlashing } from "./usb-partial-flashing.js";

// Temporary workaround for ChromeOS 105 bug.
// See https://bugs.chromium.org/p/chromium/issues/detail?id=1363712&q=usb&can=2
export const isChromeOS105 = (): boolean => {
  const userAgent = navigator.userAgent;
  return /CrOS/.test(userAgent) && /Chrome\/105\b/.test(userAgent);
};

export interface MicrobitWebUSBConnectionOptions {
  // We should copy this type when extracting a library, and make it optional.
  // Coupling for now to make it easy to evolve.

  logging: Logging;
}

export interface MicrobitWebUSBConnection
  extends DeviceConnection<SerialConnectionEventMap> {
  /**
   * Gets micro:bit deviceId.
   *
   * @returns the device id or undefined if there is no connection.
   */
  getDeviceId(): number | undefined;

  /**
   * Sets device request exclusion filters.
   */
  setRequestDeviceExclusionFilters(exclusionFilters: USBDeviceFilter[]): void;

  /**
   * Flash the micro:bit.
   *
   * @param dataSource The data to use.
   * @param options Flash options and progress callback.
   */
  flash(dataSource: FlashDataSource, options: {}): Promise<void>;

  /**
   * Gets micro:bit device.
   *
   * @returns the USB device or undefined if there is no connection.
   */
  getDevice(): USBDevice | undefined;

  /**
   * Resets the micro:bit in software.
   */
  softwareReset(): Promise<void>;
}

/**
 * A WebUSB connection factory.
 */
export const createWebUSBConnection = (
  options?: MicrobitWebUSBConnectionOptions,
): MicrobitWebUSBConnection => new MicrobitWebUSBConnectionImpl(options);

/**
 * A WebUSB connection to a micro:bit device.
 */
class MicrobitWebUSBConnectionImpl
  extends TypedEventTarget<DeviceConnectionEventMap & SerialConnectionEventMap>
  implements MicrobitWebUSBConnection
{
  status: ConnectionStatus =
    navigator.usb && !isChromeOS105()
      ? ConnectionStatus.NO_AUTHORIZED_DEVICE
      : ConnectionStatus.NOT_SUPPORTED;

  private exclusionFilters: USBDeviceFilter[] | undefined;
  /**
   * The USB device we last connected to.
   * Cleared if it is disconnected.
   */
  private device: USBDevice | undefined;
  /**
   * The connection to the device.
   */
  private connection: DAPWrapper | undefined;

  private serialState: boolean = false;

  private serialStateChangeQueue = new PromiseQueue();

  private serialListener = (data: string) => {
    this.dispatchTypedEvent("serialdata", new SerialDataEvent(data));
  };

  private flashing: boolean = false;
  private disconnectAfterFlash: boolean = false;
  private visibilityReconnect: boolean = false;
  private visibilityChangeListener = () => {
    if (document.visibilityState === "visible") {
      if (
        this.visibilityReconnect &&
        this.status !== ConnectionStatus.CONNECTED
      ) {
        this.disconnectAfterFlash = false;
        this.visibilityReconnect = false;
        if (!this.flashing) {
          this.log("Reconnecting visible tab");
          this.connect();
        }
      }
    } else {
      if (!this.unloading && this.status === ConnectionStatus.CONNECTED) {
        if (!this.flashing) {
          this.log("Disconnecting hidden tab");
          this.disconnect().then(() => {
            this.visibilityReconnect = true;
          });
        } else {
          this.log("Scheduling disconnect of hidden tab for after flash");
          this.disconnectAfterFlash = true;
        }
      }
    }
  };

  private unloading = false;

  private beforeUnloadListener = () => {
    // If serial is in progress when the page unloads with V1 DAPLink 0254 or V2 0255
    // then it'll fail to reconnect with mismatched command/response errors.
    // Try hard to disconnect as a workaround.
    // https://github.com/microbit-foundation/python-editor-v3/issues/89
    this.unloading = true;
    this.stopSerialInternal();
    // The user might stay on the page if they have unsaved changes and there's another beforeunload listener.
    window.addEventListener(
      "focus",
      () => {
        const assumePageIsStayingOpenDelay = 1000;
        setTimeout(() => {
          if (this.status === ConnectionStatus.CONNECTED) {
            this.unloading = false;
            if (this.addedListeners.serialdata) {
              this.startSerialInternal();
            }
          }
        }, assumePageIsStayingOpenDelay);
      },
      { once: true },
    );
  };

  private logging: Logging;

  private addedListeners: Record<string, number> = {
    serialdata: 0,
  };

  constructor(
    options: MicrobitWebUSBConnectionOptions = { logging: new NullLogging() },
  ) {
    super();
    this.logging = options.logging;
  }

  private log(v: any) {
    this.logging.log(v);
  }

  async initialize(): Promise<void> {
    if (navigator.usb) {
      navigator.usb.addEventListener("disconnect", this.handleDisconnect);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.beforeUnloadListener);
      if (window.document) {
        window.document.addEventListener(
          "visibilitychange",
          this.visibilityChangeListener,
        );
      }
    }
  }

  dispose() {
    if (navigator.usb) {
      navigator.usb.removeEventListener("disconnect", this.handleDisconnect);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadListener);
      if (window.document) {
        window.document.removeEventListener(
          "visibilitychange",
          this.visibilityChangeListener,
        );
      }
    }
  }

  setRequestDeviceExclusionFilters(exclusionFilters: USBDeviceFilter[]) {
    this.exclusionFilters = exclusionFilters;
  }

  async connect(): Promise<ConnectionStatus> {
    return this.withEnrichedErrors(async () => {
      await this.connectInternal();
      return this.status;
    });
  }

  getDeviceId(): number | undefined {
    return this.connection?.deviceId;
  }

  getDevice(): USBDevice | undefined {
    return this.device;
  }

  getBoardVersion(): BoardVersion | undefined {
    return this.connection?.boardSerialInfo?.id.toBoardVersion();
  }

  async flash(
    dataSource: FlashDataSource,
    options: FlashOptions,
  ): Promise<void> {
    this.flashing = true;
    try {
      const startTime = new Date().getTime();
      await this.withEnrichedErrors(() =>
        this.flashInternal(dataSource, options),
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
    options: FlashOptions,
  ): Promise<void> {
    this.log("Stopping serial before flash");
    await this.stopSerialInternal();
    this.log("Reconnecting before flash");
    await this.connectInternal();
    if (!this.connection) {
      throw new Error("Must be connected now");
    }

    const partial = options.partial;
    const progress = rateLimitProgress(
      options.minimumProgressIncrement ?? 0.0025,
      options.progress || (() => {}),
    );

    const boardId = this.connection.boardSerialInfo.id;
    const boardVersion = boardId.toBoardVersion();
    const data = await dataSource(boardVersion);
    const flashing = new PartialFlashing(
      this.connection,
      this.logging,
      boardVersion,
    );
    let wasPartial: boolean = false;
    try {
      if (partial) {
        wasPartial = await flashing.flashAsync(data, progress);
      } else {
        await flashing.fullFlashAsync(data, progress);
      }
    } finally {
      progress(undefined, wasPartial);

      if (this.disconnectAfterFlash) {
        this.log("Disconnecting after flash due to tab visibility");
        this.disconnectAfterFlash = false;
        await this.disconnect();
        this.visibilityReconnect = true;
      } else {
        this.log("Reinstating serial after flash");
        if (this.connection.daplink) {
          await this.connection.daplink.connect();
          await this.startSerialInternal();
        }
      }
    }
  }

  private async startSerialInternal() {
    return this.serialStateChangeQueue.add(async () => {
      if (!this.connection || this.serialState) {
        return;
      }
      this.log("Starting serial");
      this.serialState = true;
      this.connection
        .startSerial(this.serialListener)
        .then(() => {
          this.log("Finished listening for serial data");
        })
        .catch((e) => {
          this.dispatchTypedEvent("serialerror", new SerialErrorEvent(e));
        })
        .finally(() => {
          this.serialState = false;
        });
    });
  }

  private async stopSerialInternal() {
    return this.serialStateChangeQueue.add(async () => {
      if (!this.connection || !this.serialState) {
        return;
      }
      this.connection.stopSerial(this.serialListener);
      this.dispatchTypedEvent("serialreset", new SerialResetEvent());
    });
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
      this.setStatus(ConnectionStatus.DISCONNECTED);
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
    this.log("USB connection status " + newStatus);
    this.dispatchTypedEvent("status", new ConnectionStatusEvent(newStatus));
  }

  private async withEnrichedErrors<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e: any) {
      if (e instanceof FlashDataError) {
        throw e;
      }

      // Log error to console for feedback
      this.log("An error occurred whilst attempting to use WebUSB.");
      this.log(
        "Details of the error can be found below, and may be useful when trying to replicate and debug the error.",
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

  async softwareReset(): Promise<void> {
    return this.serialStateChangeQueue.add(
      async () => await this.connection?.softwareReset(),
    );
  }

  private handleDisconnect = (event: USBConnectionEvent) => {
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

  private async connectInternal(): Promise<void> {
    if (!this.connection) {
      const device = await this.chooseDevice();
      this.connection = new DAPWrapper(device, this.logging);
    }
    await withTimeout(this.connection.reconnectAsync(), 10_000);
    if (this.addedListeners.serialdata && !this.flashing) {
      this.startSerialInternal();
    }
    this.setStatus(ConnectionStatus.CONNECTED);
  }

  private async chooseDevice(): Promise<USBDevice> {
    if (this.device) {
      return this.device;
    }
    this.dispatchTypedEvent("beforerequestdevice", new BeforeRequestDevice());
    this.device = await navigator.usb.requestDevice({
      exclusionFilters: this.exclusionFilters,
      filters: [{ vendorId: 0x0d28, productId: 0x0204 }],
    });
    this.dispatchTypedEvent("afterrequestdevice", new AfterRequestDevice());
    return this.device;
  }

  protected eventActivated(type: string): void {
    switch (type as keyof SerialConnectionEventMap) {
      case "serialdata": {
        if (!this.flashing) {
          this.startSerialInternal();
        }
        break;
      }
    }
  }

  protected async eventDeactivated(type: string) {
    switch (type as keyof SerialConnectionEventMap) {
      case "serialdata": {
        this.stopSerialInternal();
        break;
      }
    }
  }
}

const genericErrorSuggestingReconnect = (e: any) =>
  new DeviceError({
    code: "reconnect-microbit",
    message: e.message,
  });

// tslint:disable-next-line: no-any
const enrichedError = (err: any): DeviceError => {
  if (err instanceof DeviceError) {
    return err;
  }
  if (err instanceof TimeoutError) {
    return new DeviceError({
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
        return new DeviceError({
          code: "update-req",
          message: err.message,
        });
      } else if (/No device selected/.test(err.message)) {
        return new DeviceError({
          code: "no-device-selected",
          message: err.message,
        });
      } else if (/Unable to claim interface/.test(err.message)) {
        return new DeviceError({
          code: "clear-connect",
          message: err.message,
        });
      } else if (err.name === "device-disconnected") {
        return new DeviceError({
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

const rateLimitProgress = (
  minimumProgressIncrement: number,
  callback: (value: number | undefined, partial: boolean) => void,
) => {
  let lastCallValue = -1;
  return (value: number | undefined, partial: boolean) => {
    if (
      value === undefined ||
      value === 0 ||
      value === 1 ||
      value >= lastCallValue + minimumProgressIncrement
    ) {
      lastCallValue = value ?? -1;
      callback(value, partial);
    }
  };
};
